package main

import (
	"bufio"
	"context"
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
	switch mode {
	case "dev":
		args = []string{"compose", "up", "-d"}
	case "prod":
		args = []string{"compose", "-f", "docker-compose.yml", "up", "-d"}
	case "core":
		args = []string{"compose", "up", "-d", "postgres", "redis", "rabbitmq", "gateway", "frontend", "structure"}
	case "docking":
		args = []string{"compose", "up", "-d", "postgres", "redis", "rabbitmq", "gateway", "frontend", "structure", "ketcher", "docking", "worker-cpu"}
	case "md":
		args = []string{"compose", "up", "-d", "postgres", "redis", "rabbitmq", "gateway", "frontend", "structure", "ketcher", "md", "worker-gpu-short"}
	default:
		args = []string{"compose", "up", "-d"}
	}

	return a.runDockerCompose(args, "Starting services...")
}

func (a *App) StopServices() error {
	return a.runDockerCompose([]string{"compose", "down"}, "Stopping services...")
}

func (a *App) RestartServices() error {
	return a.runDockerCompose([]string{"compose", "restart"}, "Restarting services...")
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

func (a *App) PullImages() error {
	return a.runDockerCompose([]string{"compose", "pull"}, "Pulling latest images...")
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
