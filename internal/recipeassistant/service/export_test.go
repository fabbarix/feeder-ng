package service

// SetAfterPerform installs the test-only hook that run calls between perform returning and the cancelled sample.
func (s *Service) SetAfterPerform(f func()) { s.afterPerform = f }
