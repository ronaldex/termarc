# Runtime record retention

Subagent PTY capabilities are released immediately on exit, error, stop,
rollback, or application shutdown. Status, bounded output, and latest-result
history are retained independently.

Completed records are pruned by both age and count; active records are never
pruned:

- `TERMARC_SUBAGENT_COMPLETED_LIMIT` (default `64`, maximum `10000`)
- `TERMARC_SUBAGENT_COMPLETED_TTL_SECONDS` (default `86400`, maximum `2592000`)

Invalid values fall back to the defaults. The control protocol `status`
response exposes active/completed/reservation counts and the effective policy.
Output history is bounded to 1 MiB raw and 1 MiB plain text per retained record.
