import { describe, expect, it } from 'vitest'
import { allocateMonthlyCostsByProduct, calculateProductPredictability } from './predictability'

describe('predictability', () => {
  it('rateia R$ 3 mil igualmente entre 10 SKUs sem pedir previsão', () => {
    const products = Array.from({ length: 10 }, (_, index) => ({ id: `p${index + 1}`, active: true }))
    const allocation = allocateMonthlyCostsByProduct({
      products,
      people: [{ id: 'person-1', name: 'Fernanda', role_title: 'Operação', fixed_monthly_cost: 3000, applies_to_all_products: true, active: true }],
    })

    expect(allocation.get('p1').team).toBe(300)
    expect(allocation.get('p10').total).toBe(300)
  })

  it('gera ponto de equilíbrio e meta de lucro automaticamente', () => {
    const result = calculateProductPredictability(
      { status: 'ok', grossRevenue: 200, netMargin: 50 },
      { team: 300, overhead: 200, paidTraffic: 500, total: 1000, items: [] },
      10,
    )

    expect(result.breakEvenUnits).toBe(20)
    expect(result.targetUnits).toBe(34)
    expect(result.breakEvenRoas).toBe(8)
    expect(result.targetRoas).toBe(13.6)
    expect(result.projectedNetPerUnitAtTarget).toBeCloseTo(20.5882, 3)
  })

  it('sinaliza quando a margem alvo é impossível', () => {
    const result = calculateProductPredictability(
      { status: 'ok', grossRevenue: 200, netMargin: 15 },
      { total: 300, paidTraffic: 0 },
      10,
    )
    expect(result.status).toBe('meta_inviavel')
    expect(result.targetUnits).toBeNull()
  })
})
