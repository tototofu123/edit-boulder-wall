package main

import (
	"fmt"
	"os"

	"mode-launchers/internal/launcher"
)

func main() {
	if err := launcher.Launch(launcher.Config{
		Name:      "AI Mode",
		Mode:      "ai-mode",
		WorkingDir: ".",
		PythonArgs: []string{"scripts/save_server.py", "8004", "/ai_mode.html"},
		URL:       "http://localhost:8004/ai_mode.html",
	}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
