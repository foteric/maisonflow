'use server'

import { createClient } from '@supabase/supabase-js' // Or your internal createServerComponentClient helper
import { revalidatePath } from 'next/cache'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role or authenticated client depending on RLS rules
)

/**
 * Fetch all units and aggregate payments for a specific property and month
 */
export async function getPropertyLedgerMatrix(propertyId: string, currentMonthStr: string) {
  // currentMonthStr format: '2026-06-01'
  
  // 1. Fetch all units for the property
  const { data: units, error: unitsError } = await supabase
    .from('units')
    .select('*')
    .eq('property_id', propertyId)
    .order('unit_name', { ascending: true })

  if (unitsError) throw new Error(unitsError.message)

  // 2. Fetch payments recorded for this specific billing month
  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('unit_id, amount_paid')
    .eq('billing_month', currentMonthStr)

  if (paymentsError) throw new Error(paymentsError.message)

  // 3. Map aggregates & calculate states for the UI matrix
  const processedUnits = units.map((unit) => {
    const unitPayments = payments.filter((p) => p.unit_id === unit.id)
    const totalPaid = unitPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0)
    
    return {
      ...unit,
      totalPaid,
      paymentStatus: totalPaid >= unit.base_rent ? 'Paid' : 'Unpaid',
      remainingArrears: Math.max(0, unit.base_rent - totalPaid)
    }
  })

  // 4. Calculate Top Stats Widgets
  const activeOccupants = units.filter(u => u.occupant_name).length
  const collectedRevenue = processedUnits.reduce((sum, u) => sum + u.totalPaid, 0)
  const outstandingArrears = processedUnits.reduce((sum, u) => sum + u.remainingArrears, 0)

  return {
    units: processedUnits,
    stats: {
      activeOccupants,
      collectedRevenue,
      outstandingArrears
    }
  }
}

/**
 * ＋ Action: Segment a New Unit
 */
export async function segmentNewUnit(formData: FormData) {
  const propertyId = formData.get('propertyId') as string
  const unitName = formData.get('unitName') as string
  const baseRent = Number(formData.get('baseRent'))
  const occupantName = formData.get('occupantName') as string
  const occupantPhone = formData.get('occupantPhone') as string

  const { error } = await supabase
    .from('units')
    .insert([{ 
      property_id: propertyId, 
      unit_name: unitName, 
      base_rent: baseRent, 
      occupant_name: occupantName, 
      occupant_phone: occupantPhone 
    }])

  if (error) {
    console.error('Error creating unit:', error.message)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/ledger') // Forces Next.js to update the page UI cache
  return { success: true }
}

/**
 * 💵 Action: Log a Collected Payment
 */
export async function logCollectedPayment(unitId: string, amount: number, monthStr: string) {
  // monthStr should be '2026-06-01'
  const { error } = await supabase
    .from('payments')
    .insert([{
      unit_id: unitId,
      amount_paid: amount,
      billing_month: monthStr
    }])

  if (error) {
    console.error('Error logging payment:', error.message)
    return { success: false, error: error.message }
  }

  revalidatePath('/dashboard/ledger')
  return { success: true }
}