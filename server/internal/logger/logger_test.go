package logger

import (
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"
)

func TestNewLoggerWritesApplicationLogsToStdout(t *testing.T) {
	withCapturedStdStreams(t, func() {
		NewLogger("railway").Info("railway stdout test")
	}, "railway stdout test")
}

func TestInitWritesDefaultApplicationLogsToStdout(t *testing.T) {
	withCapturedStdStreams(t, func() {
		Init()
		slog.Info("default stdout test")
	}, "default stdout test")
}

func withCapturedStdStreams(t *testing.T, log func(), message string) {
	t.Helper()

	originalStdout := os.Stdout
	originalStderr := os.Stderr
	t.Cleanup(func() {
		os.Stdout = originalStdout
		os.Stderr = originalStderr
		slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
	})

	stdoutReader, stdoutWriter, err := os.Pipe()
	if err != nil {
		t.Fatalf("create stdout pipe: %v", err)
	}
	stderrReader, stderrWriter, err := os.Pipe()
	if err != nil {
		t.Fatalf("create stderr pipe: %v", err)
	}
	defer stdoutReader.Close()
	defer stderrReader.Close()

	os.Stdout = stdoutWriter
	os.Stderr = stderrWriter

	log()

	stdoutWriter.Close()
	stderrWriter.Close()

	stdoutBytes, err := io.ReadAll(stdoutReader)
	if err != nil {
		t.Fatalf("read stdout: %v", err)
	}
	stderrBytes, err := io.ReadAll(stderrReader)
	if err != nil {
		t.Fatalf("read stderr: %v", err)
	}

	if !strings.Contains(string(stdoutBytes), message) {
		t.Fatalf("expected log on stdout, got stdout=%q stderr=%q", stdoutBytes, stderrBytes)
	}
	if len(stderrBytes) > 0 {
		t.Fatalf("expected no application log on stderr, got %q", stderrBytes)
	}
}
