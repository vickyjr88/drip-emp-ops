export type DaySummary = {
  /** Every order placed that day, whatever became of it. */
  orders: number;
  cancelled: number;
  /** Placed but still waiting for payment. */
  unpaid: number;
  /** Paid, packed, shipped or delivered. The basis of revenue. */
  confirmed: number;
  revenue: number;
  items: number;
  averageOrder: number;
  /** Money actually received that day, whichever day the order was placed. */
  collected: number;
};

export type Comparison = {
  label: string;
  revenue: number;
  orders: number;
  /** Percent, or null when the earlier figure is zero and a percentage would mean nothing. */
  revenueChange: number | null;
  ordersChange: number | null;
};

export type OrderRow = {
  orderNumber: string;
  customer: string;
  status: string;
  channel: string;
  total: number;
};

export type ActionOrder = { orderNumber: string; customer: string; total: number; ageHours: number };

export type Seller = { name: string; units: number; revenue: number };
export type StockItem = { name: string; sku: string; onHand: number };

export type DailyReport = {
  shopName: string;
  currency: string;
  dateKey: string;
  label: string;
  generatedAt: string;
  today: DaySummary;
  vsPreviousDay: Comparison;
  vsLastWeek: Comparison;
  statusCounts: Record<string, number>;
  orders: OrderRow[];
  ordersOmitted: number;
  needsAction: {
    paidAwaitingPacking: { count: number; oldest: ActionOrder[] };
    unpaidOver24h: { count: number; value: number; oldest: ActionOrder[] };
    pendingRefunds: number;
    newInquiries: number;
  };
  topSellers: Seller[];
  stock: { soldOut: StockItem[]; low: StockItem[] };
  demand: { abandonedCarts: number; abandonedValue: number; whatsappClicks: number; campaignClicks: number; referralClicks: number };
  attribution: { campaigns: { name: string; orders: number; revenue: number }[]; referralOrders: number; referralRevenue: number };
  catalogue: { activeProducts: number; missingPhoto: number; feedItems: number };
};
