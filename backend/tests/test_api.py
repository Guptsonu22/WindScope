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

