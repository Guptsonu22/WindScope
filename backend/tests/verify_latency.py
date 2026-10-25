import time
import httpx

client = httpx.Client(base_url="http://127.0.0.1:8000")

# Warm-up request
client.get("/api/v1/meta/info")

endpoints = [
    ("GET /api/v1/meta/info", lambda: client.get("/api/v1/meta/info")),
    ("GET /api/v1/wind/overview", lambda: client.get("/api/v1/wind/overview?startDate=2026-01-01&endDate=2026-01-31")),
    ("GET /api/v1/wind/timeseries (single day)", lambda: client.get("/api/v1/wind/timeseries?date=2026-01-15")),
    ("GET /api/v1/wind/timeseries (31 days)", lambda: client.get("/api/v1/wind/timeseries?startDate=2026-01-01&endDate=2026-01-31")),
    ("GET /api/v1/wind/metrics", lambda: client.get("/api/v1/wind/metrics?startDate=2026-01-01&endDate=2026-01-31")),
    ("GET /api/v1/wind/settlement-analysis", lambda: client.get("/api/v1/wind/settlement-analysis?startDate=2026-01-01&endDate=2026-01-31")),
    ("POST /api/v1/procurement/thermal-advisor", lambda: client.post("/api/v1/procurement/thermal-advisor", json={"targetDate": "2026-01-15", "customerDemandMW": 36000, "safetyBufferPercentile": 90})),
    ("422 Test: /api/v1/wind/overview (malformed)", lambda: client.get("/api/v1/wind/overview?startDate=bad-date")),
    ("422 Test: /api/v1/procurement/thermal-advisor (malformed)", lambda: client.post("/api/v1/procurement/thermal-advisor", json={"targetDate": "bad-date"})),
]

print(f"{'ENDPOINT':<52} | {'STATUS':<7} | {'LATENCY':<10} | {'VERIFIED'}")
print("-" * 80)
all_passed = True
for name, call in endpoints:
    t0 = time.perf_counter()
    res = call()
    ms = (time.perf_counter() - t0) * 1000
    expected_status = 422 if "422" in name else 200
    status_ok = res.status_code == expected_status
    speed_ok = ms < 200.0 if expected_status == 200 else True
    passed = status_ok and speed_ok
    if not passed:
        all_passed = False
    print(f"{name:<52} | {res.status_code:<7} | {ms:6.1f} ms | {'PASS' if passed else 'FAIL'}")

print("-" * 80)
print(f"Overall Benchmark: {'ALL PASSED (<200ms & 422 Validated)' if all_passed else 'SOME FAILED'}")
