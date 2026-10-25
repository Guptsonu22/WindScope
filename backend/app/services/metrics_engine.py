import math
from typing import Dict, List
import numpy as np

from app.schemas.models import (
    QuantitativeMetrics,
    SettlementPeriodData,
    ThermalProcurementItem,
    ThermalProcurementRequest,
    ThermalProcurementResponse,
)


class MetricsEngine:
    """Quantitative evaluation and thermal procurement optimization engine for day-ahead desk."""

    def compute_quantitative_metrics(
        self, periods: List[SettlementPeriodData]
    ) -> QuantitativeMetrics:
        """
        Evaluate forecast accuracy, volumetric imbalances, and settlement cashout exposures.
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
            )

        actuals = np.array([p.actual_mw for p in valid_periods], dtype=float)
        forecasts = np.array([p.forecast_mw for p in valid_periods], dtype=float)
        deltas = actuals - forecasts  # negative = shortfall (short), positive = surplus (long)
        abs_errors = np.abs(deltas)

        # 1. Statistical forecast quality
        mae = float(np.mean(abs_errors))
        mape = float(np.mean(abs_errors / forecasts) * 100.0)
        rmse = float(np.sqrt(np.mean(deltas ** 2)))

        # 2. Peak forecast deviation
        peak_idx = int(np.argmax(abs_errors))
        peak_error_mw = float(abs_errors[peak_idx])
        peak_period = valid_periods[peak_idx].settlement_period

        # 3. Directional Bias
        directional_bias = float(np.mean(deltas))

        # 4. Energy Imbalance Volumes (Each period is 30 mins = 0.5 hours)
        short_volume_mwh = 0.0
        long_volume_mwh = 0.0
        total_cashout_liability_gbp = 0.0

        for p in valid_periods:
            err = p.error_mw or 0.0
            price = p.system_price_gbp_mwh or 75.0
            duration_hours = 0.5
            volume_mwh = abs(err) * duration_hours

            if err < 0:
                short_volume_mwh += volume_mwh
                total_cashout_liability_gbp += volume_mwh * price
            elif err > 0:
                long_volume_mwh += volume_mwh
                # In long state, utility receives system sell price (modeled at 90% of SBP)
                total_cashout_liability_gbp -= volume_mwh * (price * 0.90)

        net_imbalance_mwh = long_volume_mwh - short_volume_mwh

        return QuantitativeMetrics(
            mae_mw=round(mae, 2),
            mape_pct=round(mape, 2),
            rmse_mw=round(rmse, 2),
            peak_error_mw=round(peak_error_mw, 1),
            peak_error_period=peak_period,
            directional_bias_mw=round(directional_bias, 2),
            total_short_volume_mwh=round(short_volume_mwh, 2),
            total_long_volume_mwh=round(long_volume_mwh, 2),
            net_imbalance_volume_mwh=round(net_imbalance_mwh, 2),
            estimated_cashout_exposure_gbp=round(max(0.0, total_cashout_liability_gbp), 2),
        )

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

            # Even if deficit is 0, traders maintain minimum spinning buffer during volatile periods
            if deficit > 0 or 32 <= p.settlement_period <= 40:
                required_reserve = round(fc_mw * (params.reserve_margin_pct / 100.0), 1)
                proc_mw = round(deficit * safety_multiplier, 1)

                if proc_mw < 20.0 and deficit == 0:
                    proc_mw = 0.0
            else:
                required_reserve = 0.0
                proc_mw = 0.0

            # Asset Selection Heuristics:
            # 1. Evening peak demand (periods 32-40 e.g. 16:00-20:00) with steep shortfall => OCGT Peaker
            # 2. High sustained deficits (> 600 MW) => CCGT Baseload
            # 3. Fast ramping / moderate deficits (< 300 MW) => BESS Fast Reserve
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

        target_date = params.target_date or (periods[0].start_time[:10] if periods else "2026-10-26")

        return ThermalProcurementResponse(
            target_date=target_date,
            reserve_margin_pct=params.reserve_margin_pct,
            total_thermal_capacity_needed_mw=round(total_capacity_mw, 1),
            total_energy_procured_mwh=round(total_energy_mwh, 2),
            total_procurement_budget_gbp=round(total_budget_gbp, 2),
            peak_procurement_mw=round(peak_proc_mw, 1),
            peak_period=peak_sp,
            asset_breakdown_mwh={k: round(v, 2) for k, v in asset_breakdown.items()},
            recommendations=items,
        )


_metrics_engine_instance: Optional[MetricsEngine] = None


def get_metrics_engine() -> MetricsEngine:
    """Singleton provider for MetricsEngine."""
    global _metrics_engine_instance
    if _metrics_engine_instance is None:
        _metrics_engine_instance = MetricsEngine()
    return _metrics_engine_instance
