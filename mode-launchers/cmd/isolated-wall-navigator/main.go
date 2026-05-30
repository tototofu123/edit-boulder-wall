package main

import (
	"fmt"
	"os"

	"mode-launchers/internal/launcher"
)

func main() {
	if err := launcher.Launch(launcher.Config{
		Name:      "Isolated Wall Navigator",
		Mode:      "isolated-wall-navigator",
		WorkingDir: "isolated-boulderwall-details",
		PythonArgs: []string{"server.py", "8000", "/wall_navigator.html"},
		URL:       "http://localhost:8000/wall_navigator.html",
	}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
