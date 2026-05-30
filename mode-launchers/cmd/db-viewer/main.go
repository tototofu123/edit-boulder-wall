package main

import (
	"fmt"
	"os"

	"mode-launchers/internal/launcher"
)

func main() {
	if err := launcher.Launch(launcher.Config{
		Name:      "DB Viewer",
		Mode:      "db-viewer",
		WorkingDir: "isolated-boulderwall-details",
		PythonArgs: []string{"server.py", "8001", "/db_view.html"},
		URL:       "http://localhost:8001/db_view.html",
	}); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
