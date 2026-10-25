import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.metrics_engine import MetricsEngine
from app.schemas.models import SettlementPeriodData

client = TestClient(app)


def test_root_health_endpoint():
    """Verify root /health endpoint returns 200 and 'ok' status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["ok", "degraded"]
    assert "version" in data
    assert "timestamp" in data


def test_api_v1_health_endpoint():
    """Verify /api/v1/health endpoint returns 200 and 'ok' status."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["ok", "degraded"]
    assert "services" in data


def test_gate_closures_list():
    """Verify gate closures returns valid auction stages."""
    response = client.get("/api/v1/gate-closures")
    assert response.status_code == 200
    closures = response.json()
    assert isinstance(closures, list)
    assert len(closures) >= 4
    closure_ids = [c["id"] for c in closures]
    assert "d1-1200" in closure_ids


def test_day_ahead_forecast():
    """Verify day-ahead forecast endpoint returns all 48 settlement periods with metrics."""
    response = client.get("/api/v1/forecast/day-ahead?target_date=2026-10-26&gate_closure_id=d1-1200")
    assert response.status_code == 200
    data = response.json()
    assert data["target_date"] == "2026-10-26"
    assert len(data["periods"]) == 48

    # Verify settlement periods sequential 1..48
    sp_numbers = [p["settlement_period"] for p in data["periods"]]
    assert sp_numbers == list(range(1, 49))

    # Verify quantitative metrics structure
    metrics = data["metrics"]
    assert "mae_mw" in metrics
    assert "mape_pct" in metrics
    assert "rmse_mw" in metrics
    assert "peak_error_mw" in metrics
    assert metrics["mae_mw"] >= 0.0


def test_thermal_procurement_calculator():
    """Verify thermal procurement post endpoint computes required capacity and asset breakdown."""
    payload = {
        "target_date": "2026-10-26",
        "reserve_margin_pct": 15.0,
        "ccgt_heat_rate_price_gbp": 80.0,
        "ocgt_peaker_price_gbp": 140.0,
        "bess_discharge_cost_gbp": 90.0,
    }
    response = client.post("/api/v1/trading/thermal-procurement", json=payload)
    assert response.status_code == 200
    result = response.json()
    assert result["reserve_margin_pct"] == 15.0
    assert "total_thermal_capacity_needed_mw" in result
    assert "total_energy_procured_mwh" in result
    assert "total_procurement_budget_gbp" in result
    assert "asset_breakdown_mwh" in result


def test_metrics_engine_unit_math():
    """Unit test for statistical metrics engine calculations."""
    engine = MetricsEngine()
    test_periods = [
        SettlementPeriodData(
            settlement_period=1,
            time_slot="00:00 - 00:30",
            start_time="2026-10-26T00:00:00Z",
            end_time="2026-10-26T00:30:00Z",
            forecast_mw=1000.0,
            actual_mw=900.0,  # delta = -100 (short)
            error_mw=-100.0,
            error_pct=-10.0,
            imbalance_direction="SHORT",
            system_price_gbp_mwh=100.0,
        ),
        SettlementPeriodData(
            settlement_period=2,
            time_slot="00:30 - 01:00",
            start_time="2026-10-26T00:30:00Z",
            end_time="2026-10-26T01:00:00Z",
            forecast_mw=1000.0,
            actual_mw=1100.0,  # delta = +100 (long)
            error_mw=100.0,
            error_pct=10.0,
            imbalance_direction="LONG",
            system_price_gbp_mwh=100.0,
        ),
    ]

    metrics = engine.compute_quantitative_metrics(test_periods)
    assert metrics.mae_mw == 100.0
    assert metrics.mape_pct == 10.1
    assert metrics.wmape_pct == 10.0
    assert metrics.rmse_mw == 100.0
    assert metrics.peak_error_mw == 100.0
    assert metrics.directional_bias_mw == 0.0
    assert metrics.total_short_volume_mwh == 50.0  # 100 MW * 0.5 hr
    assert metrics.total_long_volume_mwh == 50.0   # 100 MW * 0.5 hr


def test_get_thermal_gap_endpoint():
    """Verify /api/v1/metrics/thermal-gap returns expected thermal and conservative P90 metrics."""
    response = client.get("/api/v1/metrics/thermal-gap?target_date=2026-01-15")
    assert response.status_code == 200
    data = response.json()
    assert data["target_date"] == "2026-01-15"
    assert "p90_buffer_mw" in data
    assert "total_demand_mwh" in data
    assert "total_thermal_expected_mwh" in data
    assert "total_thermal_conservative_mwh" in data
    assert len(data["periods"]) == 48

    p1 = data["periods"][0]
    assert "demand_mw" in p1
    assert "thermal_expected_mw" in p1
    assert "thermal_conservative_mw" in p1
    assert p1["thermal_conservative_mw"] >= p1["thermal_expected_mw"]


def test_get_settlement_profile_endpoint():
    """Verify /api/v1/metrics/settlement-profile returns all 48 settlement period profiles."""
    response = client.get("/api/v1/metrics/settlement-profile")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 48
    sps = [p["settlement_period"] for p in data]
    assert sps == list(range(1, 49))
    assert all("mae_mw" in p and "uncertainty_tier" in p for p in data)


def test_get_horizon_decay_endpoint():
    """Verify /api/v1/metrics/horizon-decay returns lead time decay comparison."""
    response = client.get("/api/v1/metrics/horizon-decay?delivery_date=2026-01-15")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 3
    horizons = [d["horizon"] for d in data]
    assert any("Day-Ahead" in h for h in horizons)
    assert any("H-4" in h for h in horizons)


# =============================================================================
# RESTFUL WIND ANALYTICS & PROCUREMENT ADVISOR ENDPOINTS (TASK SPECIFICATION)
# =============================================================================

def test_wind_overview_endpoint():
    """Verify /api/v1/wind/overview returns consolidated overview with fast latency."""
    import time
    t0 = time.perf_counter()
    response = client.get("/api/v1/wind/overview?startDate=2026-01-01&endDate=2026-01-07&gateClosureTime=11:00")
    latency_ms = (time.perf_counter() - t0) * 1000

    assert response.status_code == 200
    # Requirement: Fast response
    assert latency_ms < 500  # Well within trading desk SLA

    data = response.json()
    assert "dateRange" in data
    assert "metrics" in data
    assert "timeseries" in data
    assert "periodErrors" in data

    # Verify MetricSummary schema
    metrics = data["metrics"]
    for key in ["mae", "rmse", "mape", "wmape", "bias", "p10", "p50", "p90", "totalGenerationForecastMWh", "totalGenerationActualMWh"]:
        assert key in metrics, f"Missing {key} in metrics"
        assert isinstance(metrics[key], (int, float))

    # Verify TimeseriesPoint schema
    assert len(data["timeseries"]) == 7 * 48  # 7 days * 48 SPs
    p0 = data["timeseries"][0]
    for key in ["startTime", "publishTime", "forecastMW", "actualMW", "errorMW", "settlementPeriod"]:
        assert key in p0, f"Missing {key} in TimeseriesPoint"

    # Verify SettlementPeriodError schema
    assert len(data["periodErrors"]) == 48
    sp0 = data["periodErrors"][0]
    for key in ["periodNumber", "timeLabel", "avgActualMW", "avgForecastMW", "maeMW", "biasMW"]:
        assert key in sp0, f"Missing {key} in SettlementPeriodError"


def test_wind_overview_malformed_input():
    """Verify malformed date parameters return HTTP 422 Unprocessable Entity."""
    response = client.get("/api/v1/wind/overview?startDate=invalid-date&endDate=2026-01-31")
    assert response.status_code == 422
    assert "detail" in response.json()


def test_wind_timeseries_single_day_and_range():
    """Verify /api/v1/wind/timeseries returns 30-min resolution data."""
    # Single day
    res_single = client.get("/api/v1/wind/timeseries?date=2026-01-10")
    assert res_single.status_code == 200
    points_single = res_single.json()
    assert len(points_single) == 48
    assert points_single[0]["settlementPeriod"] == 1
    assert points_single[-1]["settlementPeriod"] == 48

    # Multi-day range
    res_range = client.get("/api/v1/wind/timeseries?startDate=2026-01-01&endDate=2026-01-03")
    assert res_range.status_code == 200
    points_range = res_range.json()
    assert len(points_range) == 3 * 48


def test_wind_timeseries_malformed_date():
    """Verify /api/v1/wind/timeseries handles malformed date with HTTP 422."""
    response = client.get("/api/v1/wind/timeseries?date=2026/01/10")
    assert response.status_code == 422


def test_wind_metrics_endpoint():
    """Verify /api/v1/wind/metrics returns accurate mathematical summary."""
    response = client.get("/api/v1/wind/metrics?startDate=2026-01-01&endDate=2026-01-31&gateClosureTime=11:00")
    assert response.status_code == 200
    data = response.json()
    assert data["mae"] > 0
    assert data["rmse"] >= data["mae"]
    assert data["wmape"] > 0
    assert data["totalGenerationForecastMWh"] > 0
    assert data["totalGenerationActualMWh"] > 0


def test_wind_metrics_malformed_input():
    """Verify malformed input to /api/v1/wind/metrics returns HTTP 422."""
    response = client.get("/api/v1/wind/metrics?startDate=2026-13-45")
    assert response.status_code == 422


def test_wind_settlement_analysis_endpoint():
    """Verify /api/v1/wind/settlement-analysis returns all 48 settlement periods."""
    response = client.get("/api/v1/wind/settlement-analysis?startDate=2026-01-01&endDate=2026-01-31")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 48
    assert [p["periodNumber"] for p in data] == list(range(1, 49))
    assert all("maeMW" in p and "biasMW" in p for p in data)


def test_thermal_advisor_endpoint():
    """Verify POST /api/v1/procurement/thermal-advisor returns schedule and risk margins."""
    payload = {
        "targetDate": "2026-01-15",
        "customerDemandMW": 35000.0,
        "gateClosureTime": "11:00",
        "safetyBufferPercentile": 90.0,
    }
    response = client.post("/api/v1/procurement/thermal-advisor", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["targetDate"] == "2026-01-15"
    assert "hourlySchedule" in data
    assert len(data["hourlySchedule"]) == 48

    h0 = data["hourlySchedule"][0]
    assert h0["demand"] == 35000.0
    assert "forecastWind" in h0
    assert "recommendedThermalProcureMW" in h0
    assert "safetyReserveMW" in h0
    assert h0["safetyReserveMW"] >= 0.0


def test_thermal_advisor_malformed_input():
    """Verify POST /api/v1/procurement/thermal-advisor returns HTTP 422 on invalid date."""
    payload = {
        "targetDate": "not-a-valid-date",
        "customerDemandMW": 35000.0,
    }
    response = client.post("/api/v1/procurement/thermal-advisor", json=payload)
    assert response.status_code == 422


def test_meta_info_endpoint():
    """Verify /api/v1/meta/info returns required disclosure metadata."""
    response = client.get("/api/v1/meta/info")
    assert response.status_code == 200
    data = response.json()
    assert "dataSource" in data
    assert "elexonBmrsStatus" in data
    assert data["targetPeriod"] == "January 2026"
    assert "version" in data
    assert "aiToolsDisclosure" in data


