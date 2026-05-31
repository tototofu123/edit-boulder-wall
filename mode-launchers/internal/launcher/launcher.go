package launcher

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

type Config struct {
	Name       string
	Mode       string
	WorkingDir  string
	PythonArgs  []string
	URL        string
	TraceLabel string
}

func Launch(config Config) error {
	root, err := findRepoRoot()
	if err != nil {
		return err
	}

	traceLabel := config.TraceLabel
	if traceLabel == "" {
		traceLabel = config.Mode
	}

	runDir := filepath.Join(root, "mode-launchers", "traces", traceLabel, time.Now().Format("2006-01-02_15-04-05"))
	if err := os.MkdirAll(runDir, 0o755); err != nil {
		return fmt.Errorf("create trace directory: %w", err)
	}

	launcherLog, err := os.Create(filepath.Join(runDir, "launcher.log"))
	if err != nil {
		return fmt.Errorf("create launcher log: %w", err)
	}
	defer launcherLog.Close()

	serverLog, err := os.Create(filepath.Join(runDir, "server.log"))
	if err != nil {
		return fmt.Errorf("create server log: %w", err)
	}
	defer serverLog.Close()

	serverWriter := io.MultiWriter(serverLog, os.Stdout)
	launcherWriter := io.MultiWriter(launcherLog, os.Stdout)

	logLine(launcherWriter, "mode=%s", config.Mode)
	logLine(launcherWriter, "name=%s", config.Name)
	logLine(launcherWriter, "url=%s", config.URL)
	logLine(launcherWriter, "working_dir=%s", filepath.Join(root, config.WorkingDir))
	logLine(launcherWriter, "trace_dir=%s", runDir)
	fmt.Fprintf(os.Stdout, "Starting %s...\n", config.Name)

	pythonExe := resolvePythonExecutable(root)
	cmd := exec.Command(pythonExe, config.PythonArgs...)
	cmd.Dir = filepath.Join(root, config.WorkingDir)
	cmd.Stdout = serverWriter
	cmd.Stderr = serverWriter

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start server: %w", err)
	}
	logLine(launcherWriter, "server_pid=%d", cmd.Process.Pid)
	fmt.Fprintf(os.Stdout, "Waiting for %s...\n", config.URL)

	if err := waitForURL(config.URL, 20*time.Second); err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return fmt.Errorf("wait for server: %w", err)
	}

	if err := openURL(config.URL); err != nil {
		logLine(launcherWriter, "browser_open_error=%v", err)
		fmt.Fprintf(os.Stdout, "Browser open failed: %v\n", err)
	} else {
		logLine(launcherWriter, "browser_opened=true")
		fmt.Fprintf(os.Stdout, "Opened %s\n", config.URL)
	}

	logLine(launcherWriter, "server_ready=true")
	fmt.Fprintf(os.Stdout, "Trace files: %s\n", runDir)
	return cmd.Wait()
}

func findRepoRoot() (string, error) {
	startDir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if fileExists(filepath.Join(startDir, "ai_mode.html")) && fileExists(filepath.Join(startDir, "wall_navigator.html")) {
			return startDir, nil
		}
		parent := filepath.Dir(startDir)
		if parent == startDir {
			break
		}
		startDir = parent
	}
	return "", fmt.Errorf("could not locate repository root from %s", startDir)
}

func resolvePythonExecutable(root string) string {
	candidates := []string{
		filepath.Join(root, ".venv", "Scripts", "python.exe"),
		filepath.Join(root, ".venv", "Scripts", "python"),
		filepath.Join(root, ".venv", "bin", "python"),
		"python",
	}
	for _, candidate := range candidates {
		if candidate == "python" {
			return candidate
		}
		if fileExists(candidate) {
			return candidate
		}
	}
	return "python"
}

func waitForURL(url string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 750 * time.Millisecond}
	for time.Now().Before(deadline) {
		resp, err := client.Get(url)
		if err == nil {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 500 {
				return nil
			}
		}
		time.Sleep(250 * time.Millisecond)
	}
	return fmt.Errorf("timed out waiting for %s", url)
}

func openURL(url string) error {
	if runtime.GOOS == "windows" {
		return exec.Command("cmd", "/c", "start", "", url).Start()
	}
	if runtime.GOOS == "darwin" {
		return exec.Command("open", url).Start()
	}
	return exec.Command("xdg-open", url).Start()
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func logLine(writer io.Writer, format string, args ...any) {
	_, _ = fmt.Fprintf(writer, format+"\n", args...)
}
