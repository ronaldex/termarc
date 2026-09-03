use std::collections::VecDeque;

pub(super) struct SubagentOutput {
    pub(super) raw: BoundedOutput,
    pub(super) plain: BoundedOutput,
    stripper: AnsiStripper,
}

impl SubagentOutput {
    pub(super) fn new(capacity: usize) -> Self {
        Self {
            raw: BoundedOutput::new(capacity),
            plain: BoundedOutput::new(capacity),
            stripper: AnsiStripper::default(),
        }
    }

    pub(super) fn append(&mut self, bytes: &[u8]) {
        self.raw.append(bytes);
        let plain = self.stripper.strip(bytes);
        self.plain.append(&plain);
    }
}

pub(super) struct BoundedOutput {
    bytes: VecDeque<u8>,
    start_cursor: u64,
    capacity: usize,
}

impl BoundedOutput {
    pub(super) fn new(capacity: usize) -> Self {
        Self {
            bytes: VecDeque::with_capacity(capacity),
            start_cursor: 0,
            capacity,
        }
    }

    pub(super) fn append(&mut self, bytes: &[u8]) {
        if bytes.len() >= self.capacity {
            let discarded = self.bytes.len().saturating_add(bytes.len() - self.capacity);
            self.start_cursor = self.start_cursor.saturating_add(discarded as u64);
            self.bytes.clear();
            self.bytes
                .extend(bytes[bytes.len() - self.capacity..].iter().copied());
            return;
        }
        let overflow = self
            .bytes
            .len()
            .saturating_add(bytes.len())
            .saturating_sub(self.capacity);
        self.bytes.drain(..overflow);
        self.start_cursor = self.start_cursor.saturating_add(overflow as u64);
        self.bytes.extend(bytes.iter().copied());
    }

    pub(super) fn end_cursor(&self) -> u64 {
        self.start_cursor.saturating_add(self.bytes.len() as u64)
    }

    pub(super) fn read(&self, after: u64, limit: usize) -> (u64, Vec<u8>, u64, bool) {
        let truncated = after < self.start_cursor;
        let effective_after = after.max(self.start_cursor);
        let offset = (effective_after - self.start_cursor) as usize;
        let data = self
            .bytes
            .iter()
            .skip(offset)
            .take(limit)
            .copied()
            .collect::<Vec<_>>();
        let cursor = effective_after.saturating_add(data.len() as u64);
        (effective_after, data, cursor, truncated)
    }
}

#[derive(Default)]
pub(super) struct AnsiStripper {
    state: StripState,
}

#[derive(Default)]
enum StripState {
    #[default]
    Ground,
    Escape,
    Csi,
    Osc,
    OscEscape,
}

impl AnsiStripper {
    pub(super) fn strip(&mut self, input: &[u8]) -> Vec<u8> {
        let mut output = Vec::with_capacity(input.len());
        for &byte in input {
            self.state = match self.state {
                StripState::Ground if byte == 0x1b => StripState::Escape,
                StripState::Ground if byte < 0x20 && !matches!(byte, b'\n' | b'\r' | b'\t') => {
                    StripState::Ground
                }
                StripState::Ground if byte == 0x7f => StripState::Ground,
                StripState::Ground => {
                    output.push(byte);
                    StripState::Ground
                }
                StripState::Escape if byte == b'[' => StripState::Csi,
                StripState::Escape if byte == b']' => StripState::Osc,
                StripState::Escape if (0x30..=0x7e).contains(&byte) => StripState::Ground,
                StripState::Escape => StripState::Escape,
                StripState::Csi if (0x40..=0x7e).contains(&byte) => StripState::Ground,
                StripState::Csi => StripState::Csi,
                StripState::Osc if byte == 0x07 => StripState::Ground,
                StripState::Osc if byte == 0x1b => StripState::OscEscape,
                StripState::Osc => StripState::Osc,
                StripState::OscEscape if byte == b'\\' => StripState::Ground,
                StripState::OscEscape if byte == 0x1b => StripState::OscEscape,
                StripState::OscEscape => StripState::Osc,
            };
        }
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_is_incremental_bounded_and_reports_truncation() {
        let mut output = BoundedOutput::new(5);
        output.append(b"abc");
        assert_eq!(output.read(0, 2), (0, b"ab".to_vec(), 2, false));
        output.append(b"defg");
        assert_eq!(output.end_cursor(), 7);
        assert_eq!(output.read(0, 10), (2, b"cdefg".to_vec(), 7, true));
    }

    #[test]
    fn strips_sequences_across_chunks() {
        let mut stripper = AnsiStripper::default();
        assert_eq!(stripper.strip(b"hello\x1b[31"), b"hello");
        assert_eq!(stripper.strip(b"m red\x1b[0m\x1b]0;title\x07!"), b" red!");
    }
}
