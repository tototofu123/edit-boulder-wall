package main

import (
	"fmt"
	"os"

	"mode-launchers/internal/launcher"
)

func main() {
	if err := launcher.Launch(launcher.Config{
		Name:      "Wall Navigator",
		Mode:      "wall-navigator",
		WorkingDir: ".",
		PythonArgs: []string{"scripts/save_server.py", "8003", "/wall_navigator.html"},
		URL:       "http://localhost:8003/wall_navigator.html",
	}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
