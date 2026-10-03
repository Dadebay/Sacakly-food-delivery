//go:build !darwin && !windows

package main

import (
	"context"
	"errors"
	"net/netip"
	"os"
	"path/filepath"
)

type systemNetworkDriver struct{}

var errNetworkPlatform = errors.New("настройка сети доступна только в Windows и macOS")

func newSystemNetworkDriver() networkDriver     { return systemNetworkDriver{} }
func networkStatePath() string                  { return filepath.Join(os.TempDir(), "a7-tagam-network-state.json") }
func prepareNetworkStateDir() error             { return errNetworkPlatform }
func replaceNetworkState(from, to string) error { return os.Rename(from, to) }
func lockNetworkState(string) (func(), error)   { return nil, errNetworkPlatform }
func (systemNetworkDriver) adapters(context.Context) ([]networkAdapter, error) {
	return nil, errNetworkPlatform
}
func (systemNetworkDriver) neighbor(context.Context, networkAdapter, netip.Addr) (bool, error) {
	return false, errNetworkPlatform
}
func (systemNetworkDriver) add(context.Context, networkAdapter, string) error {
	return errNetworkPlatform
}
func (systemNetworkDriver) remove(context.Context, networkAdapter, string) error {
	return errNetworkPlatform
}
func elevateNetworkWorker(string) error { return errNetworkPlatform }
func openNetworkSettings(string)        {}
