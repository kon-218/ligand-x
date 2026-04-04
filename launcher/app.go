package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"strings"
	"sync"
	"time"

	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type ServiceStatus struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Health  string `json:"health"`
	Running bool   `json:"running"`
}

type SystemStatus struct {
	DockerInstalled bool            `json:"dockerInstalled"`
	DockerRunning   bool            `json:"dockerRunning"`
	Services        []ServiceStatus `json:"services"`
	TotalRunning    int             `json:"totalRunning"`
	TotalServices   int             `json:"totalServices"`
}

type LogEntry struct {
	Service   string `json:"service"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
}

type PullProgress struct {
	GroupID         string  `json:"groupId"`
	GroupName       string  `json:"groupName"`
	ImageIndex      int     `json:"imageIndex"`
	TotalImages     int     `json:"totalImages"`
	CurrentImage    string  `json:"currentImage"`
	ImagePercent    float64 `json:"imagePercent"`
	OverallPercent  float64 `json:"overallPercent"`
	Status          string  `json:"status"`
	BytesTotal      int64   `json:"bytesTotal"`
	BytesDownloaded int64   `json:"bytesDownloaded"`
}

type ServiceGroup struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Services    []string `json:"services"`
	Images      []string `json:"images"`
	SizeMB      int      `json:"sizeMb"`
	Required    bool     `json:"required"`
	DefaultOn   bool     `json:"defaultOn"`
}

type LauncherConfig struct {
	FirstRunDone   bool     `json:"firstRunDone"`
	SelectedGroups []string `json:"selectedGroups"`
	ConfigVersion  int      `json:"configVersion"`
}

type App struct {
	ctx           context.Context
	dockerClient  *client.Client
	projectPath   string
	logStreams    map[string]context.CancelFunc
	logStreamsMux sync.Mutex
}

func NewApp() *App {
	return &App{
		logStreams: make(map[string]context.CancelFunc),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.initDockerClient()
	a.detectProjectPath()
}

func (a *App) shutdown(ctx context.Context) {
	a.stopAllLogStreams()
	if a.dockerClient != nil {
		a.dockerClient.Close()
	}
}

func (a *App) initDockerClient() {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err == nil {
		a.dockerClient = cli
	}
}

func (a *App) detectProjectPath() {
	execPath, err := os.Executable()
	if err != nil {
		a.projectPath = "."
		return
	}

	execDir := filepath.Dir(execPath)

	// Search paths relative to executable location
	// The launcher might be in: project/launcher/build/bin/ or just project/
	searchPaths := []string{
		execDir,                                 // Same dir as executable
		filepath.Join(execDir, ".."),            // One level up
		filepath.Join(execDir, "..", ".."),      // Two levels up (launcher/)
		filepath.Join(execDir, "..", "..", ".."), // Three levels up (project root from build/bin)
		filepath.Join(execDir, "..", "..", "..", ".."), // Four levels up
	}

	// Also check current working directory
	cwd, err := os.Getwd()
	if err == nil {
		searchPaths = append(searchPaths, cwd)
		searchPaths = append(searchPaths, filepath.Join(cwd, ".."))
		searchPaths = append(searchPaths, filepath.Join(cwd, "..", ".."))
	}

	for _, path := range searchPaths {
		composePath := filepath.Join(path, "docker-compose.yml")
		if _, err := os.Stat(composePath); err == nil {
			a.projectPath, _ = filepath.Abs(path)
			return
		}
	}

	// Fallback: use current working directory (user can change via UI)
	if cwd != "" {
		a.projectPath = cwd
	} else {
		a.projectPath = execDir
	}
}

func (a *App) CheckDocker() (bool, string) {
	if a.dockerClient == nil {
		a.initDockerClient()
	}

	if a.dockerClient == nil {
		return false, "Docker client not initialized. Is Docker installed?"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := a.dockerClient.Ping(ctx)
	if err != nil {
		return false, fmt.Sprintf("Docker is not running: %v", err)
	}

	return true, "Docker is running"
}

func (a *App) GetSystemStatus() SystemStatus {
	status := SystemStatus{
		Services: []ServiceStatus{},
	}

	dockerOk, _ := a.CheckDocker()
	status.DockerInstalled = a.dockerClient != nil
	status.DockerRunning = dockerOk

	if !dockerOk {
		return status
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	containers, err := a.dockerClient.ContainerList(ctx, types.ContainerListOptions{All: true})
	if err != nil {
		return status
	}

	ligandxServices := map[string]bool{
		"gateway": true, "frontend": true, "structure": true,
		"docking": true, "md": true, "admet": true, "boltz2": true,
		"qc": true, "alignment": true, "ketcher": true, "msa": true,
		"abfe": true, "rbfe": true,
		"postgres": true, "redis": true, "rabbitmq": true,
		"worker-qc": true, "worker-gpu-short": true, "worker-gpu-long": true, "worker-cpu": true,
		"flower": true,
	}

	for _, c := range containers {
		serviceName := c.Labels["com.docker.compose.service"]
		projectName := c.Labels["com.docker.compose.project"]

		// Filter: must be a docker compose container for a known ligand-x service.
		// We match on service name (not project name) since the project name varies
		// by directory name (ligand-x, ligandx, etc.).
		// Extra guard: project name must contain "ligand" to avoid false positives.
		if serviceName == "" || !ligandxServices[serviceName] {
			continue
		}
		if !strings.Contains(projectName, "ligand") && projectName != "ligandx" {
			continue
		}

		health := ""
		if strings.Contains(c.Status, "(healthy)") {
			health = "healthy"
		} else if strings.Contains(c.Status, "(unhealthy)") {
			health = "unhealthy"
		} else if strings.Contains(c.Status, "(starting)") {
			health = "starting"
		}

		svc := ServiceStatus{
			Name:    serviceName,
			Status:  c.State,
			Health:  health,
			Running: c.State == "running",
		}

		if c.State == "running" {
			status.TotalRunning++
		}

		status.Services = append(status.Services, svc)
		status.TotalServices++
	}

	return status
}

func (a *App) StartServices(mode string) error {
	dockerOk, msg := a.CheckDocker()
	if !dockerOk {
		return fmt.Errorf(msg)
	}

	if err := a.ensureDataDirs(); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
			Service:   "launcher",
			Message:   fmt.Sprintf("Warning: Could not create data directories: %v", err),
			Timestamp: time.Now().Format("15:04:05"),
		})
	}

	var args []string
	var services []string

	// Load launcher config to get selected service groups
	config, err := a.GetLauncherConfig()
	if err != nil || config.SelectedGroups == nil || len(config.SelectedGroups) == 0 {
		// Fallback to legacy mode behavior if config not available
		switch mode {
		case "dev":
			args = []string{"compose", "up", "-d", "--pull=never"}
		case "prod":
			args = []string{"compose", "-f", "docker-compose.yml", "up", "-d", "--pull=never"}
		case "core":
			args = []string{"compose", "up", "-d", "--pull=never", "postgres", "redis", "rabbitmq", "gateway", "frontend", "structure"}
		case "docking":
			args = []string{"compose", "up", "-d", "--pull=never", "postgres", "redis", "rabbitmq", "gateway", "frontend", "structure", "ketcher", "docking", "worker-cpu"}
		case "md":
			args = []string{"compose", "up", "-d", "--pull=never", "postgres", "redis", "rabbitmq", "gateway", "frontend", "structure", "ketcher", "md", "worker-gpu-short"}
		default:
			args = []string{"compose", "up", "-d", "--pull=never"}
		}
	} else {
		// Use selected service groups from config
		allGroups := a.GetServiceGroups()
		groupMap := make(map[string]ServiceGroup)
		for _, g := range allGroups {
			groupMap[g.ID] = g
		}

		serviceSet := make(map[string]bool)
		for _, groupID := range config.SelectedGroups {
			if group, ok := groupMap[groupID]; ok {
				for _, svc := range group.Services {
					serviceSet[svc] = true
				}
			}
		}

		for svc := range serviceSet {
			services = append(services, svc)
		}

		args = []string{"compose", "up", "-d", "--pull=never"}
		args = append(args, services...)
	}

	return a.runDockerCompose(args, "Starting services...")
}

func (a *App) StartServiceGroups(env string, groupIDs []string) error {
	dockerOk, msg := a.CheckDocker()
	if !dockerOk {
		return fmt.Errorf(msg)
	}

	if err := a.ensureDataDirs(); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
			Service:   "launcher",
			Message:   fmt.Sprintf("Warning: Could not create data directories: %v", err),
			Timestamp: time.Now().Format("15:04:05"),
		})
	}

	allGroups := a.GetServiceGroups()
	groupMap := make(map[string]ServiceGroup)
	for _, g := range allGroups {
		groupMap[g.ID] = g
	}

	serviceSet := make(map[string]bool)
	for _, groupID := range groupIDs {
		if group, ok := groupMap[groupID]; ok {
			for _, svc := range group.Services {
				serviceSet[svc] = true
			}
		}
	}

	var services []string
	for svc := range serviceSet {
		services = append(services, svc)
	}

	var args []string
	if env == "prod" {
		args = []string{"compose", "-f", "docker-compose.yml", "up", "-d", "--pull=never"}
	} else {
		args = []string{"compose", "up", "-d", "--pull=never"}
	}
	args = append(args, services...)

	return a.runDockerCompose(args, fmt.Sprintf("Starting %s (%d services)...", env, len(services)))
}

func (a *App) StartServicesCustom(env string, services []string) error {
	dockerOk, msg := a.CheckDocker()
	if !dockerOk {
		return fmt.Errorf(msg)
	}

	if err := a.ensureDataDirs(); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
			Service:   "launcher",
			Message:   fmt.Sprintf("Warning: Could not create data directories: %v", err),
			Timestamp: time.Now().Format("15:04:05"),
		})
	}

	var args []string
	if env == "prod" {
		args = []string{"compose", "-f", "docker-compose.yml", "up", "-d"}
	} else {
		args = []string{"compose", "up", "-d"}
	}

	args = append(args, services...)

	modeLabel := env
	if len(services) > 0 {
		modeLabel = fmt.Sprintf("%s (%d services)", env, len(services))
	}

	return a.runDockerCompose(args, fmt.Sprintf("Starting %s...", modeLabel))
}

func (a *App) StopServices() error {
	return a.runDockerCompose([]string{"compose", "down"}, "Stopping services...")
}

func (a *App) RestartServices() error {
	return a.runDockerCompose([]string{"compose", "restart"}, "Restarting services...")
}

func (a *App) RestartServiceGroups(groupIDs []string) error {
	allGroups := a.GetServiceGroups()
	groupMap := make(map[string]ServiceGroup)
	for _, g := range allGroups {
		groupMap[g.ID] = g
	}

	serviceSet := make(map[string]bool)
	for _, groupID := range groupIDs {
		if group, ok := groupMap[groupID]; ok {
			for _, svc := range group.Services {
				serviceSet[svc] = true
			}
		}
	}

	var services []string
	for svc := range serviceSet {
		services = append(services, svc)
	}

	args := []string{"compose", "restart"}
	args = append(args, services...)
	return a.runDockerCompose(args, fmt.Sprintf("Restarting %d services...", len(services)))
}

func (a *App) RestartServicesCustom(services []string) error {
	args := []string{"compose", "restart"}
	args = append(args, services...)
	label := fmt.Sprintf("Restarting %d services...", len(services))
	return a.runDockerCompose(args, label)
}

func (a *App) runDockerCompose(args []string, message string) error {
	// Validate project path has docker-compose.yml
	composePath := filepath.Join(a.projectPath, "docker-compose.yml")
	if _, err := os.Stat(composePath); os.IsNotExist(err) {
		errMsg := fmt.Sprintf("docker-compose.yml not found in %s. Please select the correct project folder.", a.projectPath)
		wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
			Service:   "launcher",
			Message:   errMsg,
			Timestamp: time.Now().Format("15:04:05"),
		})
		return fmt.Errorf(errMsg)
	}

	wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
		Service:   "launcher",
		Message:   message,
		Timestamp: time.Now().Format("15:04:05"),
	})

	wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
		Service:   "launcher",
		Message:   fmt.Sprintf("Working directory: %s", a.projectPath),
		Timestamp: time.Now().Format("15:04:05"),
	})

	cmd := exec.Command("docker", args...)
	cmd.Dir = a.projectPath

	uid := os.Getuid()
	gid := os.Getgid()
	if uid < 0 { // os.Getuid() returns -1 on Windows
		uid = 0
	}
	if gid < 0 {
		gid = 0
	}
	cmd.Env = append(os.Environ(),
		fmt.Sprintf("UID=%d", uid),
		fmt.Sprintf("GID=%d", gid),
	)

	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start docker compose: %v", err)
	}

	go a.streamOutput(stdout, "docker")
	go a.streamOutput(stderr, "docker")

	if err := cmd.Wait(); err != nil {
		return fmt.Errorf("docker compose failed: %v", err)
	}

	wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
		Service:   "launcher",
		Message:   "Operation completed successfully",
		Timestamp: time.Now().Format("15:04:05"),
	})

	return nil
}

func (a *App) streamOutput(r io.Reader, service string) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
			Service:   service,
			Message:   scanner.Text(),
			Timestamp: time.Now().Format("15:04:05"),
		})
	}
}

func (a *App) ensureDataDirs() error {
	dirs := []string{
		"data/rbfe_outputs", "data/abfe_outputs", "data/docking_outputs",
		"data/md_outputs", "data/boltz_outputs", "data/qc_jobs",
		"data/qc_results_db", "data/msa_cache",
	}

	for _, dir := range dirs {
		fullPath := filepath.Join(a.projectPath, dir)
		if err := os.MkdirAll(fullPath, 0755); err != nil {
			return err
		}
	}

	return nil
}

func (a *App) OpenBrowser(url string) {
	var cmd *exec.Cmd

	switch goruntime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}

	cmd.Start()
}

func (a *App) OpenFrontend() {
	a.OpenBrowser("http://localhost:3000")
}

func (a *App) OpenAPI() {
	a.OpenBrowser("http://localhost:8000/docs")
}

func (a *App) OpenFlower() {
	a.OpenBrowser("http://localhost:5555/flower")
}

func (a *App) GetProjectPath() string {
	return a.projectPath
}

func (a *App) SetProjectPath(path string) error {
	composePath := filepath.Join(path, "docker-compose.yml")
	if _, err := os.Stat(composePath); os.IsNotExist(err) {
		return fmt.Errorf("docker-compose.yml not found in %s", path)
	}

	a.projectPath, _ = filepath.Abs(path)
	return nil
}

func (a *App) SelectProjectFolder() (string, error) {
	path, err := wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Select Ligand-X Project Folder",
	})
	if err != nil {
		return "", err
	}

	if path == "" {
		return "", nil
	}

	if err := a.SetProjectPath(path); err != nil {
		return "", err
	}

	return a.projectPath, nil
}

func (a *App) GetEnvContent(mode string) (string, error) {
	var envFile, templateFile string
	if mode == "prod" {
		envFile = ".env.production"
		templateFile = ".env.production.template"
	} else {
		envFile = ".env"
		templateFile = ".env.example"
	}

	envPath := filepath.Join(a.projectPath, envFile)
	data, err := os.ReadFile(envPath)
	if err == nil {
		return string(data), nil
	}

	// env file doesn't exist — load template and auto-save it as the env file
	templatePath := filepath.Join(a.projectPath, templateFile)
	data, err = os.ReadFile(templatePath)
	if err != nil {
		return "", fmt.Errorf("no %s file found and could not read %s: %v", envFile, templateFile, err)
	}

	// Write template as the starting env file so docker compose can read it immediately
	_ = os.WriteFile(envPath, data, 0644)

	return string(data), nil
}

func (a *App) SaveEnvContent(mode string, content string) error {
	var envFile string
	if mode == "prod" {
		envFile = ".env.production"
	} else {
		envFile = ".env"
	}
	envPath := filepath.Join(a.projectPath, envFile)
	return os.WriteFile(envPath, []byte(content), 0644)
}

func (a *App) ViewLogs(service string) error {
	a.stopLogStream(service)

	ctx, cancel := context.WithCancel(context.Background())

	a.logStreamsMux.Lock()
	a.logStreams[service] = cancel
	a.logStreamsMux.Unlock()

	go func() {
		args := []string{"compose", "logs", "-f", "--tail", "100"}
		if service != "all" {
			args = append(args, service)
		}

		cmd := exec.CommandContext(ctx, "docker", args...)
		cmd.Dir = a.projectPath

		stdout, _ := cmd.StdoutPipe()
		stderr, _ := cmd.StderrPipe()

		if err := cmd.Start(); err != nil {
			return
		}

		go a.streamOutput(stdout, service)
		go a.streamOutput(stderr, service)

		cmd.Wait()
	}()

	return nil
}

func (a *App) StopLogStream(service string) {
	a.stopLogStream(service)
}

func (a *App) stopLogStream(service string) {
	a.logStreamsMux.Lock()
	defer a.logStreamsMux.Unlock()

	if cancel, ok := a.logStreams[service]; ok {
		cancel()
		delete(a.logStreams, service)
	}
}

func (a *App) stopAllLogStreams() {
	a.logStreamsMux.Lock()
	defer a.logStreamsMux.Unlock()

	for _, cancel := range a.logStreams {
		cancel()
	}
	a.logStreams = make(map[string]context.CancelFunc)
}

func (a *App) pullImageWithProgress(ctx context.Context, image, groupID, groupName string, imageIndex, totalImages int) error {
	// Track layer-level progress
	type layerState struct {
		status   string
		current  int64
		total    int64
		startTime time.Time
	}
	layers := make(map[string]*layerState)
	var lastEmitPercent float64
	var lastEmitTime time.Time

	// Use Docker API directly for structured JSON stream
	reader, err := a.dockerClient.ImagePull(ctx, image, types.ImagePullOptions{})
	if err != nil {
		return fmt.Errorf("failed to pull %s: %v", image, err)
	}
	defer reader.Close()

	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		var msg struct {
			Status         string `json:"status"`
			Error          string `json:"error"`
			ID             string `json:"id"`
			ProgressDetail struct {
				Current int64 `json:"current"`
				Total   int64 `json:"total"`
			} `json:"progressDetail"`
		}

		if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
			continue // Skip non-JSON lines
		}

		// Handle errors in stream
		if msg.Error != "" {
			return fmt.Errorf("docker pull error: %s", msg.Error)
		}

		// Update or create layer state
		if msg.ID != "" {
			if _, ok := layers[msg.ID]; !ok {
				layers[msg.ID] = &layerState{startTime: time.Now()}
			}
			layers[msg.ID].status = msg.Status
			if msg.ProgressDetail.Total > 0 {
				layers[msg.ID].current = msg.ProgressDetail.Current
				layers[msg.ID].total = msg.ProgressDetail.Total
			}
		}

		// Calculate per-image progress
		var totalBytes int64
		var downloadedBytes int64
		for _, layer := range layers {
			totalBytes += layer.total
			if layer.status == "Downloading" || layer.status == "Pull complete" {
				downloadedBytes += layer.current
			}
		}

		var imagePercent float64
		if totalBytes > 0 {
			imagePercent = float64(downloadedBytes) / float64(totalBytes) * 100
		}

		overallPercent := (float64(imageIndex) + imagePercent/100) / float64(totalImages) * 100

		// Throttle emissions: only emit if percent changed ≥1% or 500ms elapsed
		shouldEmit := false
		if imagePercent-lastEmitPercent >= 1 {
			shouldEmit = true
		} else if time.Since(lastEmitTime) >= 500*time.Millisecond {
			shouldEmit = true
		}

		if shouldEmit && totalBytes > 0 {
			lastEmitPercent = imagePercent
			lastEmitTime = time.Now()

			progress := PullProgress{
				GroupID:         groupID,
				GroupName:       groupName,
				ImageIndex:      imageIndex,
				TotalImages:     totalImages,
				CurrentImage:    image,
				ImagePercent:    imagePercent,
				OverallPercent:  overallPercent,
				Status:          msg.Status,
				BytesDownloaded: downloadedBytes,
				BytesTotal:      totalBytes,
			}
			wailsRuntime.EventsEmit(a.ctx, "pullProgress", progress)
		}
	}

	if err := scanner.Err(); err != nil {
		return fmt.Errorf("error reading pull stream: %v", err)
	}

	return nil
}

func (a *App) PullImages() error {
	config, err := a.GetLauncherConfig()
	if err != nil || config.SelectedGroups == nil || len(config.SelectedGroups) == 0 {
		wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
			Service:   "launcher",
			Message:   "No services selected. Configure services in the Services tab first.",
			Timestamp: time.Now().Format("15:04:05"),
		})
		return fmt.Errorf("no services selected; configure in Services tab")
	}

	// Get selected services from groups
	allGroups := a.GetServiceGroups()
	groupMap := make(map[string]ServiceGroup)
	for _, g := range allGroups {
		groupMap[g.ID] = g
	}

	serviceSet := make(map[string]bool)
	for _, groupID := range config.SelectedGroups {
		if group, ok := groupMap[groupID]; ok {
			for _, svc := range group.Services {
				serviceSet[svc] = true
			}
		}
	}

	var services []string
	for svc := range serviceSet {
		services = append(services, svc)
	}

	// Pull selected services using docker compose (logs only, no progress bars)
	return a.runDockerCompose(append([]string{"compose", "pull"}, services...), "Pulling selected services...")
}

func (a *App) CleanDocker() error {
	wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
		Service:   "launcher",
		Message:   "Cleaning Docker resources...",
		Timestamp: time.Now().Format("15:04:05"),
	})

	cmds := [][]string{
		{"container", "prune", "-f"},
		{"image", "prune", "-f"},
	}

	for _, args := range cmds {
		cmd := exec.Command("docker", args...)
		cmd.Dir = a.projectPath
		if err := cmd.Run(); err != nil {
			wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
				Service:   "launcher",
				Message:   fmt.Sprintf("Warning: %v", err),
				Timestamp: time.Now().Format("15:04:05"),
			})
		}
	}

	wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
		Service:   "launcher",
		Message:   "Cleanup completed",
		Timestamp: time.Now().Format("15:04:05"),
	})

	return nil
}

func (a *App) getConfigPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, "ligandx-launcher", "config.json"), nil
}

func (a *App) GetServiceGroups() []ServiceGroup {
	return []ServiceGroup{
		{
			ID:          "core",
			Name:        "Core Services",
			Description: "Essential services: Gateway, Frontend, Structure, and supporting infrastructure",
			Services:    []string{"postgres", "redis", "rabbitmq", "gateway", "frontend", "structure", "alignment", "ketcher", "msa", "worker-cpu"},
			Images: []string{
				"ghcr.io/kon-218/ligand-x/gateway:latest",
				"ghcr.io/kon-218/ligand-x/frontend:latest",
				"ghcr.io/kon-218/ligand-x/structure:latest",
				"ghcr.io/kon-218/ligand-x/alignment:latest",
				"ghcr.io/kon-218/ligand-x/ketcher:latest",
				"ghcr.io/kon-218/ligand-x/msa:latest",
				"ghcr.io/kon-218/ligand-x/worker-cpu:latest",
				"redis:7-alpine",
				"postgres:16-alpine",
				"rabbitmq:3.13-management-alpine",
			},
			SizeMB:    3000,
			Required:  true,
			DefaultOn: true,
		},
		{
			ID:          "docking",
			Name:        "Molecular Docking",
			Description: "AutoDock Vina-based protein-ligand docking calculations",
			Services:    []string{"docking"},
			Images: []string{
				"ghcr.io/kon-218/ligand-x/docking:latest",
			},
			SizeMB:    800,
			Required:  false,
			DefaultOn: true,
		},
		{
			ID:          "md",
			Name:        "Molecular Dynamics",
			Description: "MD simulations with OpenMM/OpenFF, includes ABFE and RBFE support",
			Services:    []string{"md", "abfe", "rbfe", "worker-gpu-short", "worker-gpu-long"},
			Images: []string{
				"ghcr.io/kon-218/ligand-x/md:latest",
				"ghcr.io/kon-218/ligand-x/abfe:latest",
				"ghcr.io/kon-218/ligand-x/rbfe:latest",
				"ghcr.io/kon-218/ligand-x/worker-gpu-short:latest",
				"ghcr.io/kon-218/ligand-x/worker-gpu-long:latest",
			},
			SizeMB:    10000,
			Required:  false,
			DefaultOn: true,
		},
		{
			ID:          "admet",
			Name:        "ADMET Prediction",
			Description: "Predict molecular properties: absorption, distribution, metabolism, excretion, and toxicity",
			Services:    []string{"admet"},
			Images: []string{
				"ghcr.io/kon-218/ligand-x/admet:latest",
			},
			SizeMB:    1500,
			Required:  false,
			DefaultOn: true,
		},
		{
			ID:          "qc",
			Name:        "Quantum Chemistry",
			Description: "ORCA-based quantum chemistry calculations (GPU recommended, large download)",
			Services:    []string{"qc", "worker-qc"},
			Images: []string{
				"ghcr.io/kon-218/ligand-x/qc:latest",
				"ghcr.io/kon-218/ligand-x/worker-qc:latest",
			},
			SizeMB:    3000,
			Required:  false,
			DefaultOn: false,
		},
		{
			ID:          "boltz2",
			Name:        "Boltz-2",
			Description: "Boltz-2 binding affinity predictions (GPU required, large download)",
			Services:    []string{"boltz2"},
			Images: []string{
				"ghcr.io/kon-218/ligand-x/boltz2:latest",
			},
			SizeMB:    6000,
			Required:  false,
			DefaultOn: false,
		},
	}
}

func (a *App) GetLauncherConfig() (LauncherConfig, error) {
	configPath, err := a.getConfigPath()
	if err != nil {
		return LauncherConfig{ConfigVersion: 1}, err
	}

	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return LauncherConfig{FirstRunDone: false, SelectedGroups: []string{}, ConfigVersion: 1}, nil
		}
		return LauncherConfig{ConfigVersion: 1}, fmt.Errorf("failed to read config: %w", err)
	}

	var config LauncherConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return LauncherConfig{ConfigVersion: 1}, fmt.Errorf("corrupted config file: %w", err)
	}

	return config, nil
}

func (a *App) SaveLauncherConfig(config LauncherConfig) error {
	configPath, err := a.getConfigPath()
	if err != nil {
		return err
	}

	// Create config directory if it doesn't exist
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config: %w", err)
	}

	return nil
}

func (a *App) CheckGPU() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "nvidia-smi")
	err := cmd.Run()
	return err == nil
}

func (a *App) CheckImagePresence() map[string]bool {
	result := make(map[string]bool)

	if a.dockerClient == nil {
		a.initDockerClient()
	}

	if a.dockerClient == nil {
		allGroups := a.GetServiceGroups()
		for _, g := range allGroups {
			result[g.ID] = false
		}
		return result
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	images, err := a.dockerClient.ImageList(ctx, types.ImageListOptions{})
	if err != nil {
		allGroups := a.GetServiceGroups()
		for _, g := range allGroups {
			result[g.ID] = false
		}
		return result
	}

	// Build a list of available image tags
	var availableImages []string
	for _, img := range images {
		for _, tag := range img.RepoTags {
			if tag != "<none>:<none>" {
				availableImages = append(availableImages, tag)
			}
		}
	}

	allGroups := a.GetServiceGroups()
	for _, group := range allGroups {
		allPresent := true
		for _, requiredImage := range group.Images {
			found := false

			// Extract the service name from required image (e.g., "gateway" from "ghcr.io/kon-218/ligand-x/gateway:latest")
			parts := strings.Split(requiredImage, "/")
			serviceName := ""
			if len(parts) > 0 {
				// Get last part and remove tag if present
				lastPart := parts[len(parts)-1]
				serviceName = strings.Split(lastPart, ":")[0]
			}

			// Check if required image or service name is contained in any available tag
			for _, availableTag := range availableImages {
				if strings.Contains(availableTag, requiredImage) || (serviceName != "" && strings.Contains(availableTag, serviceName)) {
					found = true
					break
				}
			}

			if !found {
				allPresent = false
				break
			}
		}
		result[group.ID] = allPresent
	}

	return result
}

func (a *App) DeleteServiceGroupImages(groupID string) error {
	if a.dockerClient == nil {
		a.initDockerClient()
	}
	if a.dockerClient == nil {
		return fmt.Errorf("docker client not available")
	}

	allGroups := a.GetServiceGroups()
	var group *ServiceGroup
	for i := range allGroups {
		if allGroups[i].ID == groupID {
			group = &allGroups[i]
			break
		}
	}
	if group == nil {
		return fmt.Errorf("unknown service group: %s", groupID)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	images, err := a.dockerClient.ImageList(ctx, types.ImageListOptions{})
	if err != nil {
		return err
	}

	for _, requiredImage := range group.Images {
		parts := strings.Split(requiredImage, "/")
		serviceName := ""
		if len(parts) > 0 {
			lastPart := parts[len(parts)-1]
			serviceName = strings.Split(lastPart, ":")[0]
		}

		for _, img := range images {
			for _, tag := range img.RepoTags {
				if tag == "<none>:<none>" {
					continue
				}
				if strings.Contains(tag, requiredImage) || (serviceName != "" && strings.Contains(tag, serviceName)) {
					_, removeErr := a.dockerClient.ImageRemove(ctx, img.ID, types.ImageRemoveOptions{Force: false, PruneChildren: true})
					if removeErr != nil {
						wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
							Service:   "launcher",
							Message:   fmt.Sprintf("Warning: could not remove image %s: %v", tag, removeErr),
							Timestamp: time.Now().Format("15:04:05"),
						})
					} else {
						wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
							Service:   "launcher",
							Message:   fmt.Sprintf("Removed image: %s", tag),
							Timestamp: time.Now().Format("15:04:05"),
						})
					}
					break
				}
			}
		}
	}

	return nil
}

func (a *App) PullServiceGroups(groupIDs []string) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
					Service:   "launcher",
					Message:   fmt.Sprintf("Error during pull: %v", r),
					Timestamp: time.Now().Format("15:04:05"),
				})
				wailsRuntime.EventsEmit(a.ctx, "pullComplete", map[string]interface{}{
					"success":      false,
					"failedGroups": groupIDs,
				})
			}
		}()

		allGroups := a.GetServiceGroups()
		groupMap := make(map[string]ServiceGroup)
		for _, g := range allGroups {
			groupMap[g.ID] = g
		}

		// Check for GPU services
		gpuServices := map[string]bool{
			"qc":                true,
			"boltz2":            true,
			"worker-gpu-short":  true,
			"worker-gpu-long":   true,
		}

		hasGPUService := false
		for _, groupID := range groupIDs {
			if group, ok := groupMap[groupID]; ok {
				for _, service := range group.Services {
					if gpuServices[service] {
						hasGPUService = true
						break
					}
				}
			}
		}

		if hasGPUService && !a.CheckGPU() {
			wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
				Service:   "launcher",
				Message:   "NVIDIA GPU not detected. GPU services require NVIDIA Docker runtime.",
				Timestamp: time.Now().Format("15:04:05"),
			})
			wailsRuntime.EventsEmit(a.ctx, "pullComplete", map[string]interface{}{
				"success":      false,
				"failedGroups": groupIDs,
				"reason":       "gpu_not_found",
			})
			return
		}

		failedGroups := []string{}

		for _, groupID := range groupIDs {
			group, ok := groupMap[groupID]
			if !ok {
				continue
			}

			wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
				Service:   "launcher",
				Message:   fmt.Sprintf("Pulling %s...", group.Name),
				Timestamp: time.Now().Format("15:04:05"),
			})

			groupFailed := false
			for imgIdx, image := range group.Images {
				ctx, cancel := context.WithCancel(a.ctx)

				if err := a.pullImageWithProgress(ctx, image, groupID, group.Name, imgIdx, len(group.Images)); err != nil {
					wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
						Service:   groupID,
						Message:   fmt.Sprintf("Failed to pull %s: %v", image, err),
						Timestamp: time.Now().Format("15:04:05"),
					})
					groupFailed = true
				} else {
					wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
						Service:   groupID,
						Message:   fmt.Sprintf("Pulled image %d/%d: %s", imgIdx+1, len(group.Images), image),
						Timestamp: time.Now().Format("15:04:05"),
					})
				}

				cancel()
			}

			if groupFailed {
				failedGroups = append(failedGroups, groupID)
			} else {
				wailsRuntime.EventsEmit(a.ctx, "log", LogEntry{
					Service:   groupID,
					Message:   fmt.Sprintf("✓ All images pulled successfully for %s", group.Name),
					Timestamp: time.Now().Format("15:04:05"),
				})
			}
		}

		if len(failedGroups) > 0 {
			wailsRuntime.EventsEmit(a.ctx, "pullComplete", map[string]interface{}{
				"success":      false,
				"failedGroups": failedGroups,
			})
		} else {
			wailsRuntime.EventsEmit(a.ctx, "pullComplete", map[string]interface{}{
				"success": true,
			})
		}
	}()
}
