export type StoreCategory =
  | "trending"
  | "nba"
  | "nfl"
  | "mlb"
  | "nhl"
  | "stat2win";

export type StoreProduct = {
  id: string;
  title: string;
  subtitle?: string;
  category: StoreCategory;
  badge?: "Popular" | "New" | "Reward" | "Premium";
  imageUrl: string; // ✅ NEW
  priceUSD?: number;
  pointsCost?: number;
  premiumOnly?: boolean;

  // ✅ NEW: true si es producto físico y necesita dirección de envío
  requiresShipping?: boolean;
};

export const STORE_CATEGORIES: {
  key: StoreCategory;
  label: string;
  emoji: string;
}[] = [
  { key: "trending", label: "Trending", emoji: "🔥" },
  { key: "nba", label: "NBA", emoji: "🏀" },
  { key: "nfl", label: "NFL", emoji: "🏈" },
  { key: "mlb", label: "MLB", emoji: "⚾" },
  { key: "nhl", label: "NHL", emoji: "🏒" },
  { key: "stat2win", label: "Stat2Win", emoji: "🎽" },
];

export const STORE_PRODUCTS: StoreProduct[] = [
  {
    id: "s2w-hoodie",
    title: "Stat2Win Hoodie",
    subtitle: "Black • Limited",
    category: "stat2win",
    badge: "Reward",
    imageUrl:
      "https://images.unsplash.com/photo-1520975958225-3f61d2730b5c?auto=format&fit=crop&w=1200&q=80",
    pointsCost: 4500,
    priceUSD: 59,
    premiumOnly: false,
    requiresShipping: true,
  },
  {
    id: "s2w-cap",
    title: "Stat2Win Cap",
    subtitle: "Classic • Adjustable",
    category: "stat2win",
    badge: "New",
    imageUrl:
      "https://images.unsplash.com/photo-1528701800489-20be3c7ea06b?auto=format&fit=crop&w=1200&q=80",
    pointsCost: 2200,
    priceUSD: 29,
    premiumOnly: false,
    requiresShipping: true,
  },

  {
    id: "nba-team-tee",
    title: "NBA Team Tee",
    subtitle: "Cotton • Unisex",
    category: "nba",
    badge: "Popular",
    imageUrl:
      "https://images.unsplash.com/photo-1520975867597-0f6b0c0b7a2f?auto=format&fit=crop&w=1200&q=80",
    priceUSD: 34,
    premiumOnly: false,
    requiresShipping: true,
  },
  {
    id: "nba-shorts",
    title: "NBA Shorts",
    subtitle: "Training gear",
    category: "nba",
    badge: "New",
    imageUrl:
      "https://images.unsplash.com/photo-1520975693412-35e8a6f4f49c?auto=format&fit=crop&w=1200&q=80",
    priceUSD: 39,
    premiumOnly: true,
    requiresShipping: true,
  },

  {
    id: "nfl-gloves",
    title: "NFL Gloves",
    subtitle: "Grip • Lightweight",
    category: "nfl",
    badge: "Reward",
    imageUrl:
      "https://images.unsplash.com/photo-1520975814829-46dfb0d1b1d0?auto=format&fit=crop&w=1200&q=80",
    pointsCost: 1600,
    priceUSD: 24,
    premiumOnly: false,
    requiresShipping: true,
  },
  {
    id: "nfl-hoodie",
    title: "NFL Hoodie",
    subtitle: "Warm • Premium",
    category: "nfl",
    badge: "Premium",
    imageUrl:
      "https://images.unsplash.com/photo-1520975911324-8fd8e5d2e2a6?auto=format&fit=crop&w=1200&q=80",
    priceUSD: 74,
    premiumOnly: true,
    requiresShipping: true,
  },

  {
    id: "mlb-cap",
    title: "MLB Cap",
    subtitle: "On-field style",
    category: "mlb",
    badge: "New",
    imageUrl:
      "https://images.unsplash.com/photo-1520975747521-7a4e2f9a3f49?auto=format&fit=crop&w=1200&q=80",
    priceUSD: 32,
    premiumOnly: false,
    requiresShipping: true,
  },

  {
    id: "nhl-beanie",
    title: "NHL Beanie",
    subtitle: "Cold weather",
    category: "nhl",
    badge: "Popular",
    imageUrl:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80",
    priceUSD: 28,
    premiumOnly: false,
    requiresShipping: true,
  },
];
