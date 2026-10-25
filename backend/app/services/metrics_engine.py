import math
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np
import pandas as pd

from app.schemas.models import (
    HorizonDecayMetric,
    QuantitativeMetrics,
    SettlementPeriodData,
    SettlementPeriodErrorProfile,
    ThermalGapAnalysis,
    ThermalGapPeriod,
    ThermalProcurementItem,
    ThermalProcurementRequest,
    ThermalProcurementResponse,
)


# =============================================================================
# 1. CORE STATISTICAL MATHEMATICAL FUNCTIONS (NUMPY IMPLEMENTATIONS)
# =============================================================================

def calculate_mae(forecast: np.ndarray, actual: np.ndarray) -> float:
    """
    Mean Absolute Error (MAE):
    MAE = (1 / N) * sum(|Forecast_i - Actual_i|)
    Units: Megawatts (MW).
    """
    f = np.asarray(forecast, dtype=float)
    a = np.asarray(actual, dtype=float)
    if f.size == 0 or a.size == 0:
        return 0.0
    return float(np.mean(np.abs(f - a)))


def calculate_rmse(forecast: np.ndarray, actual: np.ndarray) -> float:
    """
    Root Mean Squared Error (RMSE):
    RMSE = sqrt((1 / N) * sum((Forecast_i - Actual_i)^2))
    Penalizes large outlier forecast swings heavily. Units: MW.
    """
    f = np.asarray(forecast, dtype=float)
    a = np.asarray(actual, dtype=float)
    if f.size == 0 or a.size == 0:
        return 0.0
    return float(np.sqrt(np.mean((f - a) ** 2)))


def calculate_mape(forecast: np.ndarray, actual: np.ndarray) -> float:
    """
    Mean Absolute Percentage Error (MAPE):
    MAPE = (1 / N) * sum(|Forecast_i - Actual_i| / Actual_i) * 100%
    Safeguards against division by zero by filtering non-zero actuals.
    """
    f = np.asarray(forecast, dtype=float)
    a = np.asarray(actual, dtype=float)
    mask = a != 0.0
    if not np.any(mask):
        return 0.0
    return float(np.mean(np.abs((f[mask] - a[mask]) / a[mask])) * 100.0)


def calculate_wmape(forecast: np.ndarray, actual: np.ndarray) -> float:
    """
    Weighted Mean Absolute Percentage Error (wMAPE):
    wMAPE = (sum(|Forecast_i - Actual_i|) / sum(Actual_i)) * 100%
    Critical for energy utilities to prevent severe distortion during calm, low-wind periods.
    """
    f = np.asarray(forecast, dtype=float)
    a = np.asarray(actual, dtype=float)
    sum_actual = float(np.sum(a))
    if sum_actual == 0.0:
        return 0.0
    sum_abs_err = float(np.sum(np.abs(f - a)))
    return float((sum_abs_err / sum_actual) * 100.0)


def calculate_mbe(forecast: np.ndarray, actual: np.ndarray) -> float:
    """
    Mean Bias Error (MBE) / Directional Bias:
    MBE = (1 / N) * sum(Forecast_i - Actual_i)
    - Positive: Over-forecasting (Client procures too little thermal -> risk of grid imbalance penalty).
    - Negative: Under-forecasting (Client procures too much thermal -> distress resale at loss).
    """
    f = np.asarray(forecast, dtype=float)
    a = np.asarray(actual, dtype=float)
    if f.size == 0 or a.size == 0:
        return 0.0
    return float(np.mean(f - a))


def calculate_pearson_correlation(forecast: np.ndarray, actual: np.ndarray) -> float:
    """
    Pearson Correlation Coefficient (r) between Forecast and Actual:
    r = sum((F_i - mean_F) * (A_i - mean_A)) / (sqrt(sum((F_i - mean_F)^2)) * sqrt(sum((A_i - mean_A)^2)))
    Range: [-1.0, 1.0].
    """
    f = np.asarray(forecast, dtype=float)
    a = np.asarray(actual, dtype=float)
    if f.size < 2 or a.size < 2:
        return 0.0

    std_f = float(np.std(f))
    std_a = float(np.std(a))
    if std_f == 0.0 or std_a == 0.0:
        return 0.0

    corr_matrix = np.corrcoef(f, a)
    return float(corr_matrix[0, 1])


def calculate_r2_score(forecast: np.ndarray, actual: np.ndarray) -> float:
    """
    Coefficient of Determination (R²):
    R² = 1 - (SS_res / SS_tot)
    where SS_res = sum((Actual_i - Forecast_i)^2) and SS_tot = sum((Actual_i - mean_Actual)^2).
    """
    f = np.asarray(forecast, dtype=float)
    a = np.asarray(actual, dtype=float)
    if f.size < 2 or a.size < 2:
        return 0.0

    ss_res = float(np.sum((a - f) ** 2))
    ss_tot = float(np.sum((a - np.mean(a)) ** 2))

    if ss_tot == 0.0:
        return 1.0 if ss_res == 0.0 else 0.0

    r2 = 1.0 - (ss_res / ss_tot)
    return float(r2)


def calculate_error_percentiles(
    forecast: np.ndarray,
    actual: np.ndarray,
    percentiles: Tuple[int, ...] = (10, 50, 90, 95),
) -> Dict[str, float]:
    """
    Compute distribution percentiles of signed forecast error (Forecast - Actual)
    and absolute forecast error (|Forecast - Actual|).
    """
    f = np.asarray(forecast, dtype=float)
    a = np.asarray(actual, dtype=float)
    if f.size == 0 or a.size == 0:
        return {f"P{p}": 0.0 for p in percentiles}

    signed_errors = f - a
    abs_errors = np.abs(signed_errors)

    results: Dict[str, float] = {}
    for p in percentiles:
        results[f"P{p}"] = float(np.percentile(signed_errors, p))
        results[f"P{p}_abs"] = float(np.percentile(abs_errors, p))

    return results


# =============================================================================
# 2. METRICS ENGINE CLASS
# =============================================================================

class MetricsEngine:
    """Quantitative forecast evaluation and procurement risk engine for energy utility desks."""

    def compute_statistical_accuracy_metrics(
        self,
        forecast: Union[np.ndarray, List[float], pd.Series],
        actual: Union[np.ndarray, List[float], pd.Series],
    ) -> Dict[str, Any]:
        """Compute comprehensive statistical metrics suite from forecast and actual arrays."""
        f = np.asarray(forecast, dtype=float)
        a = np.asarray(actual, dtype=float)

        mae = calculate_mae(f, a)
        rmse = calculate_rmse(f, a)
        mape = calculate_mape(f, a)
        wmape = calculate_wmape(f, a)
        mbe = calculate_mbe(f, a)
        pearson = calculate_pearson_correlation(f, a)
        r2 = calculate_r2_score(f, a)
        pcts = calculate_error_percentiles(f, a, percentiles=(10, 50, 90, 95))

        return {
            "mae_mw": round(mae, 2),
            "rmse_mw": round(rmse, 2),
            "mape_pct": round(mape, 2),
            "wmape_pct": round(wmape, 2),
            "mbe_mw": round(mbe, 2),
            "pearson_r": round(pearson, 4),
            "r2_score": round(r2, 4),
            "p10_error_mw": round(pcts.get("P10", 0.0), 1),
            "p50_error_mw": round(pcts.get("P50", 0.0), 1),
            "p90_error_mw": round(pcts.get("P90", 0.0), 1),
            "p95_error_mw": round(pcts.get("P95", 0.0), 1),
            "p90_abs_error_mw": round(pcts.get("P90_abs", 0.0), 1),
        }

    def compute_quantitative_metrics(
        self, periods: List[SettlementPeriodData]
    ) -> QuantitativeMetrics:
        """
        Evaluate full statistical accuracy and trading desk risk exposure metrics across
        settlement period domain models.
        """
        valid_periods = [p for p in periods if p.actual_mw is not None and p.forecast_mw > 0]
        if not valid_periods:
            return QuantitativeMetrics(
                mae_mw=0.0,
                mape_pct=0.0,
                rmse_mw=0.0,
                peak_error_mw=0.0,
                peak_error_period=1,
                directional_bias_mw=0.0,
                total_short_volume_mwh=0.0,
                total_long_volume_mwh=0.0,
                net_imbalance_volume_mwh=0.0,
                estimated_cashout_exposure_gbp=0.0,
                wmape_pct=0.0,
                mbe_mw=0.0,
                pearson_correlation=0.0,
                r2_score=0.0,
                p10_error_mw=0.0,
                p50_error_mw=0.0,
                p90_error_mw=0.0,
                p95_error_mw=0.0,
                p90_abs_error_mw=0.0,
            )

        actuals = np.array([p.actual_mw for p in valid_periods], dtype=float)
        forecasts = np.array([p.forecast_mw for p in valid_periods], dtype=float)

        # Statistical calculations
        stats = self.compute_statistical_accuracy_metrics(forecasts, actuals)
        abs_errors = np.abs(forecasts - actuals)

        # Peak forecast deviation
        peak_idx = int(np.argmax(abs_errors))
        peak_error_mw = float(abs_errors[peak_idx])
        peak_period = valid_periods[peak_idx].settlement_period

        # Volumetric imbalances & cashout liabilities
        short_volume_mwh = 0.0
        long_volume_mwh = 0.0
        total_cashout_liability_gbp = 0.0

        for p in valid_periods:
            fc = p.forecast_mw
            act = p.actual_mw if p.actual_mw is not None else fc
            err = fc - act  # positive = over-forecast (shortage in generation)
            price = p.system_price_gbp_mwh or 75.0
            volume_mwh = abs(err) * 0.5  # 30-minute period

            if err > 0:
                short_volume_mwh += volume_mwh
                total_cashout_liability_gbp += volume_mwh * price
            elif err < 0:
                long_volume_mwh += volume_mwh
                total_cashout_liability_gbp -= volume_mwh * (price * 0.90)

        net_imbalance_mwh = long_volume_mwh - short_volume_mwh

        return QuantitativeMetrics(
            mae_mw=stats["mae_mw"],
            mape_pct=stats["mape_pct"],
            rmse_mw=stats["rmse_mw"],
            peak_error_mw=round(peak_error_mw, 1),
            peak_error_period=peak_period,
            directional_bias_mw=stats["mbe_mw"],
            total_short_volume_mwh=round(short_volume_mwh, 2),
            total_long_volume_mwh=round(long_volume_mwh, 2),
            net_imbalance_volume_mwh=round(net_imbalance_mwh, 2),
            estimated_cashout_exposure_gbp=round(max(0.0, total_cashout_liability_gbp), 2),
            wmape_pct=stats["wmape_pct"],
            mbe_mw=stats["mbe_mw"],
            pearson_correlation=stats["pearson_r"],
            r2_score=stats["r2_score"],
            p10_error_mw=stats["p10_error_mw"],
            p50_error_mw=stats["p50_error_mw"],
            p90_error_mw=stats["p90_error_mw"],
            p95_error_mw=stats["p95_error_mw"],
            p90_abs_error_mw=stats["p90_abs_error_mw"],
        )

    # =========================================================================
    # 3. PROCUREMENT DECISION METRICS (DOMAIN-SPECIFIC FOR UTILITIES)
    # =========================================================================

    def calculate_thermal_gap(
        self,
        forecast_mw: Union[np.ndarray, List[float], pd.Series],
        actual_mw: Optional[Union[np.ndarray, List[float], pd.Series]] = None,
        demand_profile_mw: Optional[Union[np.ndarray, List[float], pd.Series]] = None,
        p90_buffer_mw: Optional[float] = None,
        target_date: str = "2026-01-15",
    ) -> ThermalGapAnalysis:
        """
        Calculate utility Thermal Gap procurement decision metrics:
        - Expected Thermal Procure: Thermal_expected = max(0, Demand(t) - Forecast(t))
        - Conservative P90 Safety Procure: Thermal_conservative = max(0, Demand(t) - (Forecast(t) - P90_Error_Buffer))
        - Imbalance Exposure Risk (MW): Thermal_conservative - Thermal_expected
        """
        f = np.asarray(forecast_mw, dtype=float)
        n_periods = len(f)
        if n_periods == 0:
            n_periods = 48
            f = np.full(48, 8500.0)

        a = np.asarray(actual_mw, dtype=float) if actual_mw is not None else None

        # 1. Generate realistic UK Winter Demand Profile if not provided
        if demand_profile_mw is not None:
            demand = np.asarray(demand_profile_mw, dtype=float)
        else:
            demand = self._generate_typical_uk_winter_demand(n_periods)

        # 2. Derive P90 Error Buffer if not explicitly supplied
        if p90_buffer_mw is not None:
            buffer_val = float(p90_buffer_mw)
        elif a is not None and len(a) == len(f):
            shortfalls = np.maximum(0.0, f - a)
            buffer_val = float(np.percentile(shortfalls, 90)) if np.any(shortfalls > 0) else float(np.percentile(np.abs(f - a), 90))
        else:
            buffer_val = 1450.0  # Conservative UK winter default ~1,450 MW

        periods: List[ThermalGapPeriod] = []
        total_demand_mwh = 0.0
        total_th_exp_mwh = 0.0
        total_th_cons_mwh = 0.0
        peak_th_exp = 0.0
        peak_th_cons = 0.0
        peak_period = 1

        for i in range(n_periods):
            sp = (i % 48) + 1
            start_m = (sp - 1) * 30
            h = start_m // 60
            m = start_m % 60
            end_m = start_m + 30
            eh = end_m // 60
            em = end_m % 60
            time_slot = f"{h:02d}:{m:02d} - {eh:02d}:{em:02d}"

            d_val = float(demand[i])
            fc_val = float(f[i])
            act_val = float(a[i]) if a is not None and i < len(a) else None

            # Thermal Expected: max(0, Demand(t) - Forecast(t))
            th_exp = max(0.0, d_val - fc_val)

            # Conservative P90 Safety: max(0, Demand(t) - (Forecast(t) - P90_Buffer))
            th_cons = max(0.0, d_val - (fc_val - buffer_val))

            # Imbalance Exposure Risk
            exposure_mw = th_cons - th_exp

            duration_h = 0.5
            total_demand_mwh += d_val * duration_h
            total_th_exp_mwh += th_exp * duration_h
            total_th_cons_mwh += th_cons * duration_h

            if th_cons > peak_th_cons:
                peak_th_cons = th_cons
                peak_th_exp = th_exp
                peak_period = sp

            periods.append(
                ThermalGapPeriod(
                    settlement_period=sp,
                    time_slot=time_slot,
                    demand_mw=round(d_val, 1),
                    wind_forecast_mw=round(fc_val, 1),
                    wind_actual_mw=round(act_val, 1) if act_val is not None else None,
                    thermal_expected_mw=round(th_exp, 1),
                    thermal_conservative_mw=round(th_cons, 1),
                    p90_buffer_mw=round(buffer_val, 1),
                    imbalance_exposure_mw=round(exposure_mw, 1),
                )
            )

        total_safety_margin_mwh = total_th_cons_mwh - total_th_exp_mwh

        return ThermalGapAnalysis(
            target_date=target_date,
            p90_buffer_mw=round(buffer_val, 1),
            total_demand_mwh=round(total_demand_mwh, 2),
            total_thermal_expected_mwh=round(total_th_exp_mwh, 2),
            total_thermal_conservative_mwh=round(total_th_cons_mwh, 2),
            peak_thermal_expected_mw=round(peak_th_exp, 1),
            peak_thermal_conservative_mw=round(peak_th_cons, 1),
            peak_thermal_period=peak_period,
            total_safety_margin_mwh=round(total_safety_margin_mwh, 2),
            periods=periods,
        )

    def calculate_settlement_period_breakdown(
        self, aligned_df: pd.DataFrame
    ) -> List[SettlementPeriodErrorProfile]:
        """
        Calculate average error and uncertainty profile across all 48 settlement periods.
        Identifies whether morning ramps (SPs 14-20) or evening peaks (SPs 33-39) have
        the highest forecast uncertainty.
        """
        if aligned_df.empty or "settlementPeriod" not in aligned_df.columns:
            return []

        profiles: List[SettlementPeriodErrorProfile] = []

        grouped = aligned_df.groupby("settlementPeriod")
        for sp, group in sorted(grouped, key=lambda x: x[0]):
            sp_int = int(sp)
            start_m = (sp_int - 1) * 30
            time_slot = f"{start_m // 60:02d}:{start_m % 60:02d} - {(start_m + 30) // 60:02d}:{(start_m + 30) % 60:02d}"

            f_vals = group["forecastGenerationMW"].values
            a_vals = group["actualGenerationMW"].values

            mae = calculate_mae(f_vals, a_vals)
            rmse = calculate_rmse(f_vals, a_vals)
            wmape = calculate_wmape(f_vals, a_vals)
            mbe = calculate_mbe(f_vals, a_vals)
            pcts = calculate_error_percentiles(f_vals, a_vals, percentiles=(90,))
            p90_abs = pcts.get("P90_abs", 0.0)

            # Volatility tiering
            if 32 <= sp_int <= 40 or mae > 1100.0:
                tier = "HIGH_VOLATILITY"
            elif 14 <= sp_int <= 24 or mae > 750.0:
                tier = "MODERATE"
            else:
                tier = "STABLE"

            profiles.append(
                SettlementPeriodErrorProfile(
                    settlement_period=sp_int,
                    time_slot=time_slot,
                    mean_forecast_mw=round(float(np.mean(f_vals)), 1),
                    mean_actual_mw=round(float(np.mean(a_vals)), 1),
                    mae_mw=round(mae, 2),
                    rmse_mw=round(rmse, 2),
                    wmape_pct=round(wmape, 2),
                    mbe_mw=round(mbe, 2),
                    p90_abs_error_mw=round(p90_abs, 1),
                    uncertainty_tier=tier,
                )
            )

        return profiles

    def evaluate_forecast_horizon_decay(
        self,
        actuals: Union[List[Dict[str, Any]], pd.DataFrame],
        forecasts: Union[List[Dict[str, Any]], pd.DataFrame],
        delivery_date: str = "2026-01-15",
        data_processor: Optional[Any] = None,
    ) -> List[HorizonDecayMetric]:
        """
        Evaluate accuracy decay / improvement across forecast lead time horizons:
        - 2-Days Ahead (D-2 12:00) -> Lead time: 36h
        - Day-Ahead (D-1 11:00 Gate Closure) -> Lead time: 13-37h (Baseline)
        - Post-Auction Afternoon (D-1 14:00) -> Lead time: 10-34h
        - 4-Hours Ahead (Intraday H-4) -> Lead time: 4h
        - 1-Hour Ahead (Intraday H-1 FPN) -> Lead time: 1h
        """
        from app.services.data_processor import get_data_processor
        processor = data_processor or get_data_processor()

        horizons = [
            ("Day-Ahead Auction (D-1 11:00)", "11:00", 24.0),
            ("Post-Auction Run (D-1 14:00)", "14:00", 21.0),
            ("Intraday Rolling (H-4)", "intra-h4", 4.0),
            ("Final Physical Notification (H-1)", "intra-h1", 1.0),
        ]

        # First obtain Day-Ahead 11:00 baseline MAE
        baseline_aligned = processor.align_day_ahead_forecasts(actuals, forecasts, delivery_date, gate_closure_time="11:00")
        base_mae = float(baseline_aligned["absoluteErrorMW"].mean()) if not baseline_aligned.empty else 1.0

        decay_metrics: List[HorizonDecayMetric] = []

        for name, gate_spec, lead_h in horizons:
            aligned = processor.align_day_ahead_forecasts(actuals, forecasts, delivery_date, gate_closure_time=gate_spec)
            if not aligned.empty:
                f = aligned["forecastGenerationMW"].values
                a = aligned["actualGenerationMW"].values
                mae = calculate_mae(f, a)
                rmse = calculate_rmse(f, a)
                wmape = calculate_wmape(f, a)
                mbe = calculate_mbe(f, a)
                pearson = calculate_pearson_correlation(f, a)

                reduction = ((base_mae - mae) / base_mae) * 100.0 if base_mae > 0 else 0.0

                decay_metrics.append(
                    HorizonDecayMetric(
                        horizon=name,
                        lead_time_hours=lead_h,
                        mae_mw=round(mae, 2),
                        rmse_mw=round(rmse, 2),
                        wmape_pct=round(wmape, 2),
                        mbe_mw=round(mbe, 2),
                        pearson_r=round(pearson, 4),
                        mae_reduction_pct_vs_day_ahead=round(reduction, 2),
                    )
                )

        return decay_metrics

    def calculate_thermal_procurement(
        self,
        periods: List[SettlementPeriodData],
        params: ThermalProcurementRequest,
    ) -> ThermalProcurementResponse:
        """
        Calculate thermal generation hedging requirements to mitigate wind shortfall risks.
        Recommends optimal asset mix (CCGT, Peaker OCGT, BESS) per settlement period.
        """
        items: List[ThermalProcurementItem] = []
        total_capacity_mw = 0.0
        total_energy_mwh = 0.0
        total_budget_gbp = 0.0
        peak_proc_mw = 0.0
        peak_sp = 1
        asset_breakdown = {
            "CCGT Base": 0.0,
            "OCGT Peaker": 0.0,
            "BESS Fast Reserve": 0.0,
            "Demand Side Balancing": 0.0,
        }

        safety_multiplier = 1.0 + (params.reserve_margin_pct / 100.0)

        for p in periods:
            fc_mw = p.forecast_mw
            act_mw = p.actual_mw if p.actual_mw is not None else fc_mw
            deficit = max(0.0, fc_mw - act_mw)

            # Maintain spinning reserve buffer during volatile periods
            if deficit > 0 or 32 <= p.settlement_period <= 40:
                required_reserve = round(fc_mw * (params.reserve_margin_pct / 100.0), 1)
                proc_mw = round(deficit * safety_multiplier, 1)

                if proc_mw < 20.0 and deficit == 0:
                    proc_mw = 0.0
            else:
                required_reserve = 0.0
                proc_mw = 0.0

            if proc_mw > 0:
                sp = p.settlement_period
                if 32 <= sp <= 40 and proc_mw > 500.0:
                    asset = "OCGT Peaker"
                    price = params.ocgt_peaker_price_gbp
                    urgency = "CRITICAL"
                elif proc_mw >= 450.0:
                    asset = "CCGT Base"
                    price = params.ccgt_heat_rate_price_gbp
                    urgency = "HIGH"
                elif 100.0 <= proc_mw < 450.0:
                    asset = "BESS Fast Reserve"
                    price = params.bess_discharge_cost_gbp
                    urgency = "MODERATE"
                else:
                    asset = "Demand Side Balancing"
                    price = 65.00
                    urgency = "LOW"

                duration_hours = 0.5
                energy_mwh = round(proc_mw * duration_hours, 2)
                cost = round(energy_mwh * price, 2)

                total_capacity_mw += proc_mw
                total_energy_mwh += energy_mwh
                total_budget_gbp += cost
                asset_breakdown[asset] += energy_mwh

                if proc_mw > peak_proc_mw:
                    peak_proc_mw = proc_mw
                    peak_sp = sp

                items.append(
                    ThermalProcurementItem(
                        settlement_period=sp,
                        time_slot=p.time_slot,
                        wind_forecast_mw=fc_mw,
                        revised_expected_mw=act_mw,
                        wind_deficit_mw=round(deficit, 1),
                        required_reserve_mw=required_reserve,
                        recommended_procurement_mw=proc_mw,
                        recommended_asset=asset,
                        indicative_spark_spread_price_gbp=price,
                        estimated_procurement_cost_gbp=cost,
                        urgency=urgency,
                    )
                )

        target_date = getattr(params, "target_date", None) or getattr(params, "targetDate", None) or (periods[0].start_time[:10] if periods else "2026-01-15")

        return ThermalProcurementResponse(
            targetDate=target_date,
            target_date=target_date,
            reserve_margin_pct=getattr(params, "reserve_margin_pct", 12.0) or 12.0,
            total_thermal_capacity_needed_mw=round(total_capacity_mw, 1),
            total_energy_procured_mwh=round(total_energy_mwh, 2),
            total_procurement_budget_gbp=round(total_budget_gbp, 2),
            peak_procurement_mw=round(peak_proc_mw, 1),
            peak_period=peak_sp,
            asset_breakdown_mwh={k: round(v, 2) for k, v in asset_breakdown.items()},
            recommendations=items,
        )

    def _generate_typical_uk_winter_demand(self, n_periods: int = 48) -> np.ndarray:
        """
        Generate typical UK winter National Grid electricity demand curve (MW).
        Diurnal shape:
        - Overnight baseload (03:00): ~24,000 MW
        - Morning industrial/residential ramp (08:30): ~37,000 MW
        - Afternoon plateau: ~34,000 MW
        - Evening peak lighting & heating (17:30 - SP 35): ~42,500 MW
        - Night ramp down: ~27,000 MW
        """
        demand = np.zeros(n_periods)
        for i in range(n_periods):
            sp = (i % 48) + 1
            theta = (sp / 48.0) * 2 * np.pi
            # Dual harmonic model for morning and evening peaks
            base = 32000.0
            harm1 = -np.cos(theta) * 7500.0
            harm2 = -np.cos(2 * theta + 0.4) * 4500.0
            evening_spike = 4000.0 * np.exp(-((sp - 35) ** 2) / 12.0)

            demand[i] = round(base + harm1 + harm2 + evening_spike, 1)

        return demand


_metrics_engine_instance: Optional[MetricsEngine] = None


def get_metrics_engine() -> MetricsEngine:
    """Singleton provider for MetricsEngine."""
    global _metrics_engine_instance
    if _metrics_engine_instance is None:
        _metrics_engine_instance = MetricsEngine()
    return _metrics_engine_instance
