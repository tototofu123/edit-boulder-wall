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

	logLine(launcherLog, "mode=%s", config.Mode)
	logLine(launcherLog, "name=%s", config.Name)
	logLine(launcherLog, "url=%s", config.URL)
	logLine(launcherLog, "working_dir=%s", filepath.Join(root, config.WorkingDir))

	pythonExe := resolvePythonExecutable(root)
	cmd := exec.Command(pythonExe, config.PythonArgs...)
	cmd.Dir = filepath.Join(root, config.WorkingDir)
	cmd.Stdout = serverLog
	cmd.Stderr = serverLog

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start server: %w", err)
	}
	logLine(launcherLog, "server_pid=%d", cmd.Process.Pid)

	if err := waitForURL(config.URL, 20*time.Second); err != nil {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		return fmt.Errorf("wait for server: %w", err)
	}

	if err := openURL(config.URL); err != nil {
		logLine(launcherLog, "browser_open_error=%v", err)
	} else {
		logLine(launcherLog, "browser_opened=true")
	}

	logLine(launcherLog, "server_ready=true")
	logLine(launcherLog, "trace_dir=%s", runDir)
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
