/**
 * Apple In-App Purchase service via @capgo/capacitor-purchases (RevenueCat)
 *
 * SETUP REQUIRED:
 * 1. npm install @capgo/capacitor-purchases
 * 2. npx cap sync ios
 * 3. Create a RevenueCat account at revenuecat.com
 * 4. Add your iOS app in RevenueCat and copy the API key below
 * 5. Create product "com.stat2win.premium.monthly" in App Store Connect
 * 6. Add that product as an offering in RevenueCat dashboard
 * 7. Set up RevenueCat → Firebase webhook to update users/{uid}.plan = "premium"
 */

import { Capacitor } from "@capacitor/core";

// ── Config — replace these with your real values ──────────────────────────────
export const REVENUECAT_API_KEY = "REPLACE_WITH_YOUR_REVENUECAT_IOS_KEY";
export const PREMIUM_ENTITLEMENT_ID = "premium";
export const PRODUCT_ID = "com.stat2win.premium.monthly";
// ─────────────────────────────────────────────────────────────────────────────

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

// Dynamically import to avoid web-build errors
async function getPlugin() {
  if (!isNative()) return null;
  try {
    // Use indirect dynamic import so webpack never tries to bundle this native-only module
    const dynamicImport = new Function("m", "return import(m)");
    const mod = await dynamicImport("@capgo/capacitor-purchases");
    return (mod as any).CapacitorPurchases ?? mod.default ?? null;
  } catch {
    console.warn("[IAP] @capgo/capacitor-purchases not installed — run: npm install @capgo/capacitor-purchases && npx cap sync ios");
    return null;
  }
}

/** Call once on app start, after the user is authenticated */
export async function initPurchases(userId: string): Promise<void> {
  const P = await getPlugin();
  if (!P) return;
  try {
    await P.setup({ apiKey: REVENUECAT_API_KEY, appUserID: userId });
  } catch (e) {
    console.warn("[IAP] initPurchases error:", e);
  }
}

/** Returns true if the user currently has an active premium entitlement in RevenueCat */
export async function checkIAPPremium(): Promise<boolean> {
  const P = await getPlugin();
  if (!P) return false;
  try {
    const { customerInfo } = await P.getCustomerInfo();
    return !!customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

/**
 * Triggers the Apple payment sheet for the premium subscription.
 * Returns true if purchase was successful.
 */
export async function purchasePremium(): Promise<{ success: boolean; error?: string }> {
  const P = await getPlugin();
  if (!P) {
    return { success: false, error: "In-App Purchase only available in the iOS app." };
  }
  try {
    const { offerings } = await P.getOfferings();
    const pkg = offerings?.current?.availablePackages?.[0];
    if (!pkg) {
      return { success: false, error: "No subscription package found. Please try again later." };
    }
    const { customerInfo } = await P.purchasePackage({ aPackage: pkg });
    const active = !!customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID];
    return { success: active };
  } catch (e: any) {
    if (e?.code === "1") {
      // User cancelled
      return { success: false };
    }
    return { success: false, error: e?.message ?? "Purchase failed. Please try again." };
  }
}

/** Restores previous purchases — useful if user reinstalls the app */
export async function restorePurchases(): Promise<{ success: boolean; error?: string }> {
  const P = await getPlugin();
  if (!P) {
    return { success: false, error: "In-App Purchase only available in the iOS app." };
  }
  try {
    const { customerInfo } = await P.restorePurchases();
    const active = !!customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID];
    return { success: active };
  } catch (e: any) {
    return { success: false, error: e?.message ?? "Restore failed." };
  }
}
