package main

import (
	"bytes"
	"encoding/binary"
	"net"
	"net/netip"
)

func makeARPProbe(mac net.HardwareAddr, ip netip.Addr) []byte {
	frame := make([]byte, 60)
	copy(frame[:6], []byte{255, 255, 255, 255, 255, 255})
	copy(frame[6:12], mac)
	binary.BigEndian.PutUint16(frame[12:14], 0x0806)
	binary.BigEndian.PutUint16(frame[14:16], 1)
	binary.BigEndian.PutUint16(frame[16:18], 0x0800)
	frame[18], frame[19] = 6, 4
	binary.BigEndian.PutUint16(frame[20:22], 1)
	copy(frame[22:28], mac)
	b := ip.As4()
	copy(frame[38:42], b[:])
	return frame
}

func arpClaimsAddress(frame []byte, own net.HardwareAddr, ip netip.Addr) bool {
	if len(frame) < 42 || binary.BigEndian.Uint16(frame[12:14]) != 0x0806 || binary.BigEndian.Uint16(frame[14:16]) != 1 || binary.BigEndian.Uint16(frame[16:18]) != 0x0800 || frame[18] != 6 || frame[19] != 4 || bytes.Equal(frame[22:28], own) {
		return false
	}
	op := binary.BigEndian.Uint16(frame[20:22])
	if op != 1 && op != 2 {
		return false
	}
	b := ip.As4()
	// A reply/announcement owns SPA; a simultaneous DAD probe owns TPA.
	return bytes.Equal(frame[28:32], b[:]) || (op == 1 && bytes.Equal(frame[28:32], []byte{0, 0, 0, 0}) && bytes.Equal(frame[38:42], b[:]))
}
