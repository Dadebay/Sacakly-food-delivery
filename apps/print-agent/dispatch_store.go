package main

import (
	"bufio"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// An append-only, fsynced journal records intent BEFORE touching a printer.
// A torn record or an unfinished send fails closed; it is never assumed unsent.
// No receipt content, customer details or credentials are stored here.
type dispatchStore struct {
	dir     string
	agentID string
	lock    *os.File
}

type dispatchRecord struct {
	Fingerprint string `json:"fingerprint,omitempty"`
	Copies      int    `json:"copies,omitempty"`
	Copy        int    `json:"copy"`
	State       string `json:"state"`
	Chunks      int    `json:"chunks,omitempty"`
}

type dispatchJournal struct {
	file   *os.File
	states []dispatchRecord
}

var errDispatchConflict = errors.New("этот ID задания уже использован для другого чека")

func defaultDispatchDir() (string, error) {
	dir, err := os.UserConfigDir()
	return filepath.Join(dir, "A7-tagam", "PrintAgent", "dispatches"), err
}

func openDispatchStore(dir string) (*dispatchStore, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	lock, err := os.OpenFile(filepath.Join(dir, ".lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err = lockDispatchFile(lock); err != nil {
		lock.Close()
		return nil, err
	}
	s := &dispatchStore{dir: dir, lock: lock}
	identity := filepath.Join(dir, "agent-id")
	data, err := os.ReadFile(identity)
	if os.IsNotExist(err) {
		var id [16]byte
		if _, err = rand.Read(id[:]); err != nil {
			s.Close()
			return nil, err
		}
		id[6] = (id[6] & 0x0f) | 0x40
		id[8] = (id[8] & 0x3f) | 0x80
		value := fmt.Sprintf("%x-%x-%x-%x-%x", id[0:4], id[4:6], id[6:8], id[8:10], id[10:16])
		data = []byte(value)
		var f *os.File
		f, err = os.OpenFile(identity, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err == nil {
			_, err = f.Write(data)
			if err == nil {
				err = f.Sync()
			}
			f.Close()
		}
		if err == nil {
			err = syncDispatchDir(dir)
		}
	}
	if err != nil || len(data) != 36 {
		s.Close()
		return nil, errors.New("не удалось прочитать постоянный ID программы печати")
	}
	s.agentID = string(data)
	return s, nil
}

func (s *dispatchStore) Close() {
	if s.lock != nil {
		s.lock.Close()
		s.lock = nil
	}
}

func (s *dispatchStore) open(_ string, payload printRequest) (*dispatchJournal, error) {
	// Dispatch UUIDs come from the server. The same task must stay deduplicated
	// when an authorized operator reopens the site under another allowed origin.
	key := sha256.Sum256([]byte(payload.DispatchID))
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256(encoded)
	fingerprint := hex.EncodeToString(hash[:])
	path := filepath.Join(s.dir, hex.EncodeToString(key[:])+".jsonl")
	f, err := os.OpenFile(path, os.O_RDWR|os.O_APPEND, 0600)
	if os.IsNotExist(err) {
		f, err = os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR|os.O_APPEND, 0600)
		if err != nil {
			return nil, err
		}
		j := &dispatchJournal{file: f, states: make([]dispatchRecord, len(payload.Jobs))}
		if err = j.append(dispatchRecord{Fingerprint: fingerprint, Copies: len(payload.Jobs), State: "created", Copy: -1}); err == nil {
			err = syncDispatchDir(s.dir)
		}
		if err != nil {
			f.Close()
			return nil, err
		}
		return j, nil
	}
	if err != nil {
		return nil, err
	}
	j := &dispatchJournal{file: f, states: make([]dispatchRecord, len(payload.Jobs))}
	reader := bufio.NewReader(f)
	for i := 0; ; i++ {
		line, err := reader.ReadSlice('\n')
		if err == io.EOF && len(line) == 0 && i > 0 {
			break
		}
		if err != nil {
			f.Close()
			return nil, errors.New("журнал задания повреждён; автоматический повтор остановлен")
		}
		var r dispatchRecord
		if err := json.Unmarshal(line, &r); err != nil {
			f.Close()
			return nil, err
		}
		if i == 0 {
			if r.State != "created" || r.Copies != len(payload.Jobs) || r.Fingerprint != fingerprint {
				f.Close()
				return nil, errDispatchConflict
			}
			continue
		}
		if r.Copy < 0 || r.Copy >= len(j.states) || (r.State != "started" && r.State != "sent" && r.State != "retryable") {
			f.Close()
			return nil, errors.New("invalid dispatch journal")
		}
		previous := j.states[r.Copy].State
		if previous == "sent" || ((r.State == "sent" || r.State == "retryable") && previous != "started") || (r.State == "started" && previous != "" && previous != "retryable") {
			f.Close()
			return nil, errors.New("invalid dispatch transition")
		}
		j.states[r.Copy] = r
	}
	return j, nil
}

func (j *dispatchJournal) append(r dispatchRecord) error {
	data, err := json.Marshal(r)
	if err != nil {
		return err
	}
	if _, err = j.file.Write(append(data, '\n')); err != nil {
		return err
	}
	if err = j.file.Sync(); err != nil {
		return err
	}
	if r.Copy >= 0 {
		j.states[r.Copy] = r
	}
	return nil
}
