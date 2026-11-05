#!/usr/bin/env bash
# Records CPU / RAM of every Supabase container every 5 s into a CSV, for
# the "CPU/RAM" column and the resource-utilization analysis.
# Start it in a second terminal before a test, stop it with Ctrl+C after.
#
#   bash perf/record-stats.sh load-50vu
#
# (Windows PowerShell version is in perf/README.md, step 7.)
name="${1:-run}"
out="$(dirname "$0")/results/${name}-docker-stats.csv"
echo "time,container,cpu_percent,mem_usage,mem_percent,net_io" > "$out"
echo "Writing $out (Ctrl+C to stop)"
while true; do
  docker stats --no-stream --format '{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}}' \
    | grep supabase_ \
    | sed "s/^/$(date +%H:%M:%S),/" >> "$out"
  sleep 5
done
