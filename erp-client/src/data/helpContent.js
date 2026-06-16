import {
  Compass, LayoutDashboard, Package, ShoppingCart, Factory,
  TrendingUp, Receipt, Wallet, BarChart3, UserCheck,
} from 'lucide-react';

/**
 * Content shown on the Help & Guide page (src/pages/Help/Help.jsx).
 * Each section mirrors a module in the sidebar; each topic mirrors a tab
 * or sub-page within that module.
 */
export const HELP_SECTIONS = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    icon: Compass,
    color: 'blue',
    summary: 'The basics of moving around the system before you dive into a module.',
    topics: [
      {
        id: 'navigation',
        title: 'Navigating the app',
        what: 'The sidebar on the left is your main menu. Every business area (Inventory, Sales, Finance, etc.) is a group with sub-pages underneath it.',
        steps: [
          'Click a module name (e.g. "Sales & CRM") in the sidebar to expand its sub-pages.',
          'Click any sub-page link (e.g. "Order Booking") to jump straight to that screen.',
          'The currently open page is highlighted in the sidebar so you always know where you are.',
          'Use the collapse arrow at the top of the sidebar to shrink it to icons only — useful on smaller screens.',
          'On mobile, tap the menu icon in the top bar to open the sidebar as a slide-over panel.',
        ],
        tips: [
          'Most modules open on their first tab by default — e.g. clicking "Sales & CRM" opens Order Booking.',
        ],
      },
      {
        id: 'topbar',
        title: 'Top bar: company, branch, fiscal year & profile',
        what: 'The bar across the top of every page lets you switch context and access account-level controls.',
        steps: [
          'Use the "Company" dropdown to switch between the companies set up in the system — every page reloads its data for the selected company.',
          'Use "Branch" to filter to a specific branch of the selected company.',
          'Use "Fiscal Year" to scope reports and ledgers to a particular year.',
          'Click the sun/moon icon to toggle between light and dark theme — your choice is remembered.',
          'Click the expand icon to enter full-screen mode (handy for presenting reports).',
          'Click the logout icon on the far right to sign out.',
        ],
      },
      {
        id: 'tables-filters',
        title: 'Working with tables, filters & search',
        what: 'Almost every module shows data in sortable tables with quick filter tabs above them.',
        steps: [
          'Click a column header to sort by that column; click again to reverse the order.',
          'Use the small filter tabs above a table (e.g. "All / Normal / Low Stock / Critical") to narrow the list without leaving the page.',
          'Use the search box where available to find a record by name, code, or reference number.',
          'Status badges (Pending, Approved, Dispatched, etc.) are color-coded — green means complete/healthy, amber means in-progress/attention, red means rejected/overdue/critical.',
          'Scroll a table horizontally if it has many columns — the column headers stay visible.',
        ],
      },
      {
        id: 'creating-records',
        title: 'Creating new records',
        what: 'New records (orders, invoices, vouchers, employees, etc.) are added through a button at the top-right of the page, which opens a form in a pop-up window (a "modal").',
        steps: [
          'Click the "New …" / "Add …" button in the page header (top-right, marked with a + icon).',
          'Fill in the required fields — required fields are usually marked and the Save button stays disabled until the form is valid.',
          'Add line items where applicable (e.g. order items, voucher entries) using the "Add Row" control inside the form.',
          'Click "Save" to create the record — a confirmation toast appears at the top of the screen.',
          'Click the "X" or click outside the modal to cancel without saving.',
        ],
        tips: [
          'If a save fails, a red error toast explains why — usually a missing field or a network/database issue.',
        ],
      },
      {
        id: 'theme',
        title: 'Light & dark mode',
        what: 'The app supports both a light and a dark theme.',
        steps: [
          'Click the sun/moon icon in the top-right of the top bar to switch themes.',
          'The setting applies instantly across the whole app and is remembered the next time you log in.',
        ],
      },
    ],
  },

  /* ── Dashboard ──────────────────────────────────────────────────── */
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    color: 'blue',
    summary: 'Your home screen — a snapshot of sales, stock, and tax position at a glance.',
    topics: [
      {
        id: 'overview',
        title: 'Overview',
        what: 'The landing page after login. Shows key business numbers (sales, stock value, pending orders, etc.) as summary cards plus recent activity.',
        steps: [
          'Open the Dashboard from the sidebar (it is also the page shown right after login).',
          'Review the summary cards at the top for a quick health check of the business.',
          'Use the company/branch/fiscal year selectors in the top bar to change what the numbers represent.',
          'Use the customer search box to quickly look up a customer and open their profile panel with order/payment history.',
        ],
      },
      {
        id: 'analytics',
        title: 'Analytics',
        what: 'Visual charts of sales and performance trends over time.',
        steps: [
          'Go to Dashboard → Analytics.',
          'Choose a time range — 6 Months, 1 Year, or 3 Years — to change the chart scope.',
          'Hover over chart points/bars to see exact figures for that period.',
          'Use this view to spot seasonal trends or compare growth across years.',
        ],
      },
      {
        id: 'stock',
        title: 'Available Stock',
        what: 'A live table of stock items with current quantity, reorder level, warehouse, and status.',
        steps: [
          'Go to Dashboard → Available Stock.',
          'Check the "Status" column — items below their reorder level show as Low or Critical.',
          'Sort by "Current Stock" to find the items running lowest.',
          'Use this view as an early-warning check before placing new purchase orders (Procurement → Purchase Demand Note).',
        ],
      },
      {
        id: 'sales-summary',
        title: 'Sales Summary',
        what: 'A consolidated table of sales orders with customer, dates, and amounts.',
        steps: [
          'Go to Dashboard → Sales Summary.',
          'Review order date, delivery date, and total amount for each order at a glance.',
          'Use this as a quick daily/weekly recap before going into the full Sales module for details.',
        ],
      },
      {
        id: 'tracking',
        title: 'Sales Tracking',
        what: 'Tracks where each sales order currently stands in the order-to-delivery pipeline.',
        steps: [
          'Go to Dashboard → Sales Tracking.',
          'Use this view to see which orders are booked, confirmed, in production, dispatched, or invoiced.',
          'Cross-check against Sales & CRM if you need to take action on a specific order (e.g. confirm or dispatch it).',
        ],
      },
      {
        id: 'sales-tax',
        title: 'Sales Tax Dashboard',
        what: 'A snapshot of FBR-related sales tax figures for the selected period.',
        steps: [
          'Go to Dashboard → Sales Tax Dashboard.',
          'Review the totals shown — these reflect tax collected on invoices already pushed to FBR.',
          'For the full invoice-by-invoice FBR submission status, go to Invoicing → FBR Queue.',
        ],
      },
    ],
  },

  /* ── Inventory ──────────────────────────────────────────────────── */
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    color: 'purple',
    summary: 'Manage your product catalogue, stock levels, warehouses, and stock movements.',
    topics: [
      {
        id: 'items-stock',
        title: 'Items & Stock',
        what: 'The main inventory table, showing every stock item with its gauge, category, current quantity, warehouse, batch number, and stock status.',
        steps: [
          'Go to Inventory — this table loads by default.',
          'Use the "All Items / Normal / Low Stock / Critical" tabs to filter the list by stock health.',
          'The three summary cards at the top show total catalogue items, items currently low on stock, and number of warehouses.',
          'Click "New Item" (top-right) to record incoming stock — see "Recording new stock (Inward)" below.',
        ],
      },
      {
        id: 'product-catalogue',
        title: 'Product Catalogue',
        what: 'The shared master list of products (item code, gauge, name) used across Inventory, Sales, Procurement, and Production so every module refers to the same items.',
        steps: [
          'Scroll down on the Inventory page to find the Product Catalogue table.',
          'Every item created here automatically becomes available for selection in order forms, PDNs, BOMs, and work orders.',
          'To remove an item from the catalogue, click the trash icon on its row — this only removes it from the shared list, it does not delete historical records that already used it.',
        ],
        tips: [
          'Keep item codes and gauges consistent here — other modules rely on this list for their item dropdowns.',
        ],
      },
      {
        id: 'inward',
        title: 'Recording new stock (Inward)',
        what: 'Use this when stock physically arrives in a warehouse — either from production output or a purchase receipt — and you need to add it to inventory.',
        steps: [
          'Click "New Item" at the top-right of the Inventory page.',
          'Select or add the item (code, name, gauge, category).',
          'Enter the quantity received, unit, warehouse, and batch number.',
          'Save — the item appears immediately in the Items & Stock table with status calculated against its reorder level.',
        ],
      },
      {
        id: 'warehouse-stock',
        title: 'Warehouse Stock',
        what: 'Shows stock broken down by warehouse location, so you know what is physically sitting where.',
        steps: [
          'Go to Inventory → Warehouse Stock from the sidebar.',
          'Use this to compare stock across multiple warehouses before deciding where to dispatch from or transfer to.',
        ],
      },
      {
        id: 'transfers',
        title: 'Transfers',
        what: 'Move stock quantities between warehouses without changing total inventory.',
        steps: [
          'Go to Inventory → Transfers from the sidebar.',
          'Review past transfers — source warehouse, destination warehouse, item, and quantity.',
          'Transfers update the Warehouse Stock view for both locations once recorded.',
        ],
      },
      {
        id: 'low-stock-alerts',
        title: 'Low Stock Alerts',
        what: 'A focused list of every item that has fallen below (Low) or critically below (Critical) its reorder level.',
        steps: [
          'Go to Inventory → Low Stock Alerts.',
          'Use this list to decide what to reorder next — cross-reference with Procurement → Purchase Demand Note to start the buying process.',
        ],
        tips: [
          'This list is the same data as the "Low Stock" / "Critical" filter tabs on the main Items & Stock table, just pre-filtered for convenience.',
        ],
      },
    ],
  },

  /* ── Procurement ────────────────────────────────────────────────── */
  {
    id: 'procurement',
    label: 'Procurement',
    icon: ShoppingCart,
    color: 'orange',
    summary: 'The purchasing workflow — from raising a demand to receiving goods from vendors.',
    topics: [
      {
        id: 'overview',
        title: 'Procurement workflow overview',
        what: 'Procurement follows a chain: a department raises a Purchase Demand Note (PDN) → it gets approved → it is converted into a Purchase Order (PO) sent to a vendor → goods arrive and are recorded on a Goods Received Note (GRN).',
        steps: [
          'Open Procurement from the sidebar — the summary cards show Active POs, Pending PDNs, Active Vendors, and Pending GRNs at a glance.',
          'Start a purchase by creating a PDN (see next topic).',
          'Track approvals on the PDN Approval page, then watch it become a Purchase Order once approved.',
          'When the vendor delivers, record it as a GRN to update inventory.',
        ],
      },
      {
        id: 'pdn',
        title: 'Purchase Demand Note (PDN)',
        what: 'A PDN is an internal request: "we need to buy these items." It is the starting point of every purchase.',
        steps: [
          'Click "New PDN" at the top-right of the Procurement page.',
          'Select the requesting department and set a priority (Low / Medium / High).',
          'Add the items and quantities needed.',
          'Save — the PDN appears in the table with status "Submitted" and is now ready for approval.',
          'To delete a PDN you created by mistake, click the trash icon on its row.',
        ],
      },
      {
        id: 'pdn-approval',
        title: 'PDN Approval',
        what: 'Where pending PDNs are reviewed and approved or rejected before they become purchase orders.',
        steps: [
          'Go to Procurement → PDN Approval from the sidebar.',
          'Review each PDN\'s items, quantities, and priority.',
          'Approve a PDN to allow it to proceed toward a Purchase Order, or reject it if it should not go ahead.',
        ],
      },
      {
        id: 'requisitions',
        title: 'Requisitions',
        what: 'Tracks material/item requisitions raised internally, separate from vendor purchase demands.',
        steps: [
          'Go to Procurement → Requisitions from the sidebar.',
          'Review requisition records and their current status.',
        ],
      },
      {
        id: 'purchase-orders',
        title: 'Purchase Orders',
        what: 'Formal orders sent to vendors once a PDN has been approved, showing vendor, items, amounts, and delivery due dates.',
        steps: [
          'Go to Procurement → Purchase Orders from the sidebar (or scroll to the PO table on the main Procurement page).',
          'Use the status tabs to filter for "Active" (Issued / Partially Received) orders vs. completed ones.',
          'Check the "Due" column to see which orders are approaching their delivery date.',
          'Click a row to view full PO details including item-wise breakdown and total amount.',
        ],
      },
      {
        id: 'grn',
        title: 'Goods Received Note (GRN)',
        what: 'Records what was actually received from a vendor against a Purchase Order — quantities, condition, and date.',
        steps: [
          'Go to Procurement → Goods Received Note from the sidebar.',
          'Match incoming goods to the relevant Purchase Order.',
          'A "Pending" GRN means goods are expected but not yet logged as received.',
          'Once a GRN is recorded, the received quantity should be reflected in Inventory (use "New Item" / Inward to add it to stock if not done automatically).',
        ],
      },
      {
        id: 'vendors',
        title: 'Vendors',
        what: 'The master list of suppliers — name, NTN, contact, category, and active/inactive status.',
        steps: [
          'Go to Procurement → Vendors from the sidebar.',
          'Use this list when filling in vendor fields on PDNs and Purchase Orders.',
          'Inactive vendors are shown with a red "Inactive" badge and should generally not be used for new orders.',
        ],
      },
    ],
  },

  /* ── Production ─────────────────────────────────────────────────── */
  {
    id: 'production',
    label: 'Production',
    icon: Factory,
    color: 'cyan',
    summary: 'Plan and track manufacturing — bills of materials, work orders, schedules, and finished goods.',
    topics: [
      {
        id: 'overview',
        title: 'Production overview',
        what: 'The Production page summarizes Active Work Orders, Completed This Month, and Scheduled jobs.',
        steps: [
          'Open Production from the sidebar to see the three summary cards plus the Work Orders table.',
          'A typical flow is: define a Bill of Materials → raise a Work Order against it → schedule it → record the Finished Goods once complete.',
        ],
      },
      {
        id: 'bom',
        title: 'Bill of Materials (BOM)',
        what: 'Defines the recipe for a finished product — which raw materials and quantities go into producing a given output quantity.',
        steps: [
          'Go to Production → Bill of Materials from the sidebar.',
          'Each BOM row shows the finished product, its output quantity/unit, and an Active/Inactive status.',
          'A Work Order references a BOM to know what materials to allocate for production.',
        ],
      },
      {
        id: 'work-orders',
        title: 'Work Orders',
        what: 'A work order is an instruction to produce a specific quantity of a product between a start and end date.',
        steps: [
          'Click "New Work Order" at the top-right of the Production page.',
          'Select the product, enter the quantity (in kg), and set the start and end dates.',
          'Save — the work order appears in the table with "Materials" showing whether raw materials have been allocated yet, and "QC" showing whether quality control has passed.',
          'The "Status" column tracks the order through In Progress → Completed (or Cancelled).',
        ],
        tips: [
          'A work order also appears under Sales & CRM → Work Orders when it is linked to a customer sales order, so production and sales stay in sync.',
        ],
      },
      {
        id: 'schedules',
        title: 'Schedules',
        what: 'Plans when work orders run, helping avoid clashes on shared production lines/equipment.',
        steps: [
          'Go to Production → Schedules from the sidebar.',
          'Scheduled jobs feed into the "Scheduled" count on the Production summary cards.',
        ],
      },
      {
        id: 'finished-goods',
        title: 'Finished Goods',
        what: 'Records the output of completed work orders — product, quantity produced, warehouse it was stored in, and QC status.',
        steps: [
          'Go to Production → Finished Goods from the sidebar.',
          'Each row links back to its Work Order via the "Work Order" reference column.',
          'Once finished goods are recorded here, they should also reflect as available stock in Inventory → Items & Stock for that warehouse.',
        ],
      },
    ],
  },

  /* ── Sales & CRM ────────────────────────────────────────────────── */
  {
    id: 'sales',
    label: 'Sales & CRM',
    icon: TrendingUp,
    color: 'green',
    summary: 'The order-to-cash workflow — from booking an order to invoicing and gate pass.',
    topics: [
      {
        id: 'workflow',
        title: 'Sales workflow overview',
        what: 'A sale moves through a defined pipeline: Order Booking → Order Confirmation → (Production) Work Order → Delivery (Dispatch) → Sales Invoice → Gate Pass.',
        steps: [
          'Book the order first (Order Booking) — this captures what the customer wants.',
          'Confirm the order (Order Confirmation) once terms (PO number, payment terms, GST) are finalized.',
          'If the goods need to be manufactured, a linked Work Order is created/tracked (also visible under Production).',
          'When goods are ready, create a Delivery / Dispatch record.',
          'Generate the Sales Invoice for the delivered goods — this is what feeds Invoicing and FBR.',
          'Issue a Gate Pass to authorize the vehicle/goods to leave the premises.',
        ],
        tips: [
          'You don\'t have to do all steps in one sitting — each tab keeps its own list so you can pick up an order at any stage.',
        ],
      },
      {
        id: 'customers',
        title: 'Customers',
        what: 'The customer master list — name, region/city, NTN, contact, credit limit, outstanding balance, and active/inactive status.',
        steps: [
          'Go to Sales & CRM → Customers.',
          'Click "New Customer" (top-right) to add a customer — enter name, region, NTN, contact, and credit limit.',
          'Check "Outstanding" before approving large new orders for a customer — this is their unpaid balance.',
          'Inactive customers cannot usually be selected on new orders.',
        ],
      },
      {
        id: 'order-booking',
        title: 'Order Booking',
        what: 'The first step of a sale — capture what the customer ordered.',
        steps: [
          'Go to Sales & CRM → Order Booking (this is the default tab when you open the module).',
          'Click "New Order" at the top-right.',
          'Select the customer, add the items/quantities being ordered, and set the order and delivery dates.',
          'Save — the order appears in the Order Booking list, ready to be confirmed.',
        ],
      },
      {
        id: 'order-confirmation',
        title: 'Order Confirmation',
        what: 'Finalizes a booked order with the customer\'s PO number, payment terms, and whether GST applies.',
        steps: [
          'Go to Sales & CRM → Order Confirmation.',
          'Find the order by its Order Ref. (matches the Order Booking record).',
          'Open the order and confirm/enter the PO No., Payment Term, and whether GST is applied.',
          'Save to move the order\'s status forward to "Approved"/confirmed.',
        ],
      },
      {
        id: 'work-order-sales',
        title: 'Work Orders (Sales view)',
        what: 'Shows production work orders linked to confirmed sales orders, so sales staff can see manufacturing progress without leaving the Sales module.',
        steps: [
          'Go to Sales & CRM → Work Orders.',
          'Check the status to see if the order is still In Progress or has been Completed and is ready for dispatch.',
          'For full production detail (materials, QC, BOM), see the Production module.',
        ],
      },
      {
        id: 'deliveries',
        title: 'Deliveries',
        what: 'Records dispatch of goods to the customer — delivery number, linked order, date, and vehicle number.',
        steps: [
          'Go to Sales & CRM → Deliveries.',
          'Create a delivery against a confirmed/completed order (via the Dispatch action on that order).',
          'Enter the vehicle number and delivery date.',
          'Once dispatched, the order is ready to be invoiced.',
        ],
      },
      {
        id: 'sales-invoice',
        title: 'Sales Invoice',
        what: 'Generates the customer-facing invoice for a delivered order, including freight, loading/unloading, packing, toll tax, and slitting charges.',
        steps: [
          'Go to Sales & CRM → Sales Invoice.',
          'Create an invoice from a dispatched order, reviewing the auto-filled subtotal and any additional charges.',
          'Save — the invoice is now visible in Invoicing → Invoices, where it can be submitted to FBR and printed.',
        ],
        tips: [
          'For day-to-day invoice management (printing, FBR submission, credit notes), use the Invoicing module — Sales Invoice here is where the invoice is first generated from an order.',
        ],
      },
      {
        id: 'returns',
        title: 'Sales Returns',
        what: 'Records goods returned by a customer against a previously issued sales invoice.',
        steps: [
          'Go to Sales & CRM → Sales Returns.',
          'Select the original sales invoice the return relates to.',
          'Enter the returned items and quantities.',
          'A corresponding Sale Return Invoice / Credit Note can then be issued from Invoicing → Sale Return Invoice.',
        ],
      },
      {
        id: 'gate-pass',
        title: 'Gate Pass',
        what: 'The final authorization document allowing a vehicle carrying dispatched goods to exit the premises.',
        steps: [
          'Go to Sales & CRM → Gate Pass.',
          'Issue a gate pass referencing the delivery/dispatch record.',
          'Use this as the security checkpoint document for outgoing vehicles.',
        ],
      },
    ],
  },

  /* ── Invoicing ──────────────────────────────────────────────────── */
  {
    id: 'invoicing',
    label: 'Invoicing',
    icon: Receipt,
    color: 'blue',
    summary: 'Manage invoices, submit them to FBR, and handle sale-return credit notes.',
    topics: [
      {
        id: 'invoices',
        title: 'Invoices',
        what: 'The full list of sales invoices with customer, date, tax amount, total value, and FBR submission status.',
        steps: [
          'Go to Invoicing → Invoices (default tab).',
          'Click "New Invoice" (top-right) to create an invoice directly, or generate one from Sales & CRM → Sales Invoice against a dispatched order.',
          'Click "Print" on a row to open a print-ready view of that invoice.',
          'Check the "FBR Status" column — it shows whether the invoice has been Synced to FBR, is Pending, or Failed.',
          'For an invoice that failed FBR submission, use the retry action to resend it.',
        ],
      },
      {
        id: 'fbr-queue',
        title: 'FBR Queue',
        what: 'A focused view of invoices that need to be (or have been) submitted to the FBR for tax compliance, including retry counts and last attempt time.',
        steps: [
          'Go to Invoicing → FBR Queue.',
          'Invoices with status "Failed" can be retried — check "Retries" to see how many attempts have been made.',
          'The "Last Attempt" column shows when the invoice was last submitted.',
          'Once an invoice shows "Synced", it has been successfully reported to FBR and no further action is needed.',
        ],
        tips: [
          'A connection indicator (online/offline icon) shows whether the app currently has connectivity to the FBR API.',
        ],
      },
      {
        id: 'sale-return-invoice',
        title: 'Sale Return Invoice',
        what: 'Credit notes issued against sales invoices for returned goods (linked to Sales & CRM → Sales Returns).',
        steps: [
          'Go to Invoicing → Sale Return Invoice.',
          'Each credit note shows the Credit Note No., the original sale return reference, customer, and date.',
          'Use this to issue a formal credit note once a sales return has been recorded.',
        ],
      },
    ],
  },

  /* ── Finance ────────────────────────────────────────────────────── */
  {
    id: 'finance',
    label: 'Finance',
    icon: Wallet,
    color: 'green',
    summary: 'Vouchers, bank accounts, cheques, cash, transfers, and the chart of accounts.',
    topics: [
      {
        id: 'vouchers',
        title: 'Vouchers',
        what: 'General accounting entries (journal/payment/receipt vouchers) that post debits and credits to ledger accounts.',
        steps: [
          'Go to Finance → Vouchers (default tab).',
          'Click "New Voucher" (top-right).',
          'Select the account(s), enter debit/credit amounts, date, and a narration.',
          'Save — the voucher posts to the relevant account ledgers, visible under Reports → Ledger Report.',
        ],
      },
      {
        id: 'bank-accounts',
        title: 'Bank Accounts',
        what: 'The list of company bank accounts with account number, title, type, balance, and status.',
        steps: [
          'Go to Finance → Bank Accounts.',
          'Use this list as the source of accounts when creating cheques, transfers, or reconciling in Reports → Bank Reconciliation.',
        ],
      },
      {
        id: 'cheques',
        title: 'Cheque Tracking',
        what: 'Tracks issued/received cheques and their clearing status.',
        steps: [
          'Go to Finance → Cheque Tracking.',
          'Click "New Cheque" (top-right) to log a cheque — bank account, party, amount, and date.',
          'Update a cheque\'s status as it moves from Pending to Cleared (or Bounced) once the bank processes it.',
        ],
      },
      {
        id: 'chart-of-accounts',
        title: 'Chart of Accounts',
        what: 'The master list of all ledger accounts (assets, liabilities, income, expenses) used throughout Finance and Reports.',
        steps: [
          'Go to Finance → Chart of Accounts.',
          'Browse the account structure — these accounts are what you select when creating vouchers.',
          'Account balances here tie into Reports → Trial Balance and Income Statement.',
        ],
      },
      {
        id: 'aging',
        title: 'Aging Report',
        what: 'Shows how long customer/vendor balances have been outstanding, bucketed into Current, 1-30, 31-60, and 90+ days.',
        steps: [
          'Go to Finance → Aging.',
          'Review the "Party" column alongside each aging bucket to see who has overdue balances and how overdue they are.',
          'Use the 90+ Days column (highlighted) to prioritize collections or payments.',
        ],
      },
      {
        id: 'cash-received',
        title: 'Cash Received',
        what: 'Records cash receipts from customers — separate from bank/cheque receipts.',
        steps: [
          'Go to Finance → Cash Received.',
          'Click "New Receipt" (top-right).',
          'Select the customer/party, enter the amount and date, and save.',
        ],
      },
      {
        id: 'inter-bank-transfer',
        title: 'Inter Bank Transfer',
        what: 'Records movement of funds between two of the company\'s own bank accounts.',
        steps: [
          'Go to Finance → Inter Bank Transfer.',
          'Click "New Transfer" (top-right).',
          'Select the source and destination bank accounts, enter the amount and date, and save — both account balances update accordingly.',
        ],
      },
      {
        id: 'petty-cash',
        title: 'Petty Cash',
        what: 'Tracks small day-to-day cash expenses paid out of a petty cash float.',
        steps: [
          'Go to Finance → Petty Cash.',
          'Click "New Entry" (top-right) to log an expense — description, amount, and date.',
          'Use the running total to know how much of the petty cash float remains.',
        ],
      },
      {
        id: 'daily-cash',
        title: 'Daily Cash',
        what: 'A day-by-day summary of cash movement (cash received and cash paid out via petty cash).',
        steps: [
          'Go to Finance → Daily Cash.',
          'Use this view as a daily cash-position check, especially at day close.',
        ],
      },
    ],
  },

  /* ── Reports ────────────────────────────────────────────────────── */
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    color: 'red',
    summary: 'Financial statements and operational reports drawn from data across all modules.',
    topics: [
      {
        id: 'ledger',
        title: 'Ledger Report',
        what: 'Shows the full transaction history and running balance for a single ledger account over a date range.',
        steps: [
          'Go to Reports → Ledger Report (default tab).',
          'Select an account from the dropdown — only accounts with voucher activity appear.',
          'Adjust the From/To dates — these default to the current fiscal year (July to June).',
          'The table shows each voucher entry with debit, credit, and a running balance column.',
        ],
      },
      {
        id: 'trial',
        title: 'Trial Balance',
        what: 'Lists every account in the Chart of Accounts with its current debit/credit balance — used to verify the books are balanced.',
        steps: [
          'Go to Reports → Trial Balance.',
          'Total debits should equal total credits — this confirms the ledger is in balance.',
        ],
      },
      {
        id: 'receivables',
        title: 'Accounts Receivable',
        what: 'Shows how much each customer currently owes the business.',
        steps: [
          'Go to Reports → Receivables.',
          'Use alongside Finance → Aging Report to prioritize follow-ups on overdue customers.',
        ],
      },
      {
        id: 'payables',
        title: 'Accounts Payable',
        what: 'Shows how much the business currently owes each vendor.',
        steps: [
          'Go to Reports → Payables.',
          'Use this before scheduling vendor payments to avoid missing dues.',
        ],
      },
      {
        id: 'income',
        title: 'Income Statement',
        what: 'A profit & loss summary — revenue, expenses, and net income for the selected period.',
        steps: [
          'Go to Reports → Income Statement.',
          'Read top-down: revenue sections first, then expense sections, ending in the net profit/loss figure at the bottom.',
        ],
      },
      {
        id: 'customer-ledger',
        title: 'Customer Sales Ledger',
        what: 'A per-customer record of all sales transactions, useful for account statements.',
        steps: [
          'Go to Reports → Customer Ledger.',
          'Select a customer to view their full transaction history.',
        ],
      },
      {
        id: 'region',
        title: 'Region Wise Sales',
        what: 'Breaks down sales totals by customer region/city.',
        steps: [
          'Go to Reports → Region Wise Sales.',
          'Use this to identify which regions are driving the most revenue.',
        ],
      },
      {
        id: 'sold-items',
        title: 'Sold Item Detail',
        what: 'An item-level breakdown of everything sold, useful for identifying best-selling products.',
        steps: [
          'Go to Reports → Sold Items.',
          'Sort by quantity or value to find top-moving items.',
        ],
      },
      {
        id: 'invoice-summary',
        title: 'Invoice Summary',
        what: 'A consolidated list of all sales invoices with subtotal, charges, and grand total — a totals view across Invoicing.',
        steps: [
          'Go to Reports → Invoice Summary.',
          'The bottom "Total" row sums subtotal and grand total across all listed invoices.',
        ],
      },
      {
        id: 'gst',
        title: 'Order Wise GST',
        what: 'Shows which sales orders had GST applied (based on the Order Confirmation\'s GST flag) and the resulting GST amount at 17%.',
        steps: [
          'Go to Reports → Order Wise GST.',
          'The "GST Applied" column reflects the choice made during Order Confirmation.',
          'The "Total GST" row sums all GST amounts for the period.',
        ],
      },
      {
        id: 'challan',
        title: 'Delivery Challan',
        what: 'A list of delivery notes — order reference, customer, delivery date, vehicle, and dispatch status.',
        steps: [
          'Go to Reports → Delivery Challan.',
          'Cross-reference with Sales & CRM → Deliveries for the underlying dispatch records.',
        ],
      },
      {
        id: 'bank-recon',
        title: 'Bank Reconciliation',
        what: 'Compares invoiced amounts against amounts actually paid/received per bank account, flagging matches, partial matches, and discrepancies.',
        steps: [
          'Go to Reports → Bank Reconciliation.',
          'The top cards show each bank account\'s current balance and branch.',
          'In the table, "Difference" highlights any gap between invoiced and paid amounts — investigate non-zero differences.',
          'The "Status" column flags each line as Matched, Partial, or Discrepancy.',
        ],
      },
    ],
  },

  /* ── HR & Payroll ───────────────────────────────────────────────── */
  {
    id: 'hr',
    label: 'HR & Payroll',
    icon: UserCheck,
    color: 'orange',
    summary: 'Employee records, attendance, leave, loans, and payroll processing.',
    topics: [
      {
        id: 'employees',
        title: 'Employees',
        what: 'The master list of employees — ID, name, designation, department, section, joining date, gross salary, and status.',
        steps: [
          'Go to HR & Payroll → Employees (default tab).',
          'Click "Add Employee" (top-right) to register a new employee — fill in personal details, designation, department, and salary.',
          'Click the edit (pencil) icon on a row to update an employee\'s details.',
          'Click the trash icon to remove an employee record (you\'ll be asked to confirm).',
        ],
      },
      {
        id: 'attendance',
        title: 'Attendance',
        what: 'Daily and monthly attendance tracking — Present, Absent, Late, Half Day, or On Leave.',
        steps: [
          'Go to HR & Payroll → Attendance.',
          'Use the Daily Attendance view to mark each employee\'s status for a given day.',
          'Use the Monthly Attendance view to see the full month\'s record per employee at a glance.',
          'Click "Mark Attendance" to record/update an employee\'s status for a date.',
        ],
      },
      {
        id: 'leave',
        title: 'Leave Management',
        what: 'Tracks leave applications — type, date range, number of days, reason, and approval status.',
        steps: [
          'Go to HR & Payroll → Leave.',
          'Click "Apply Leave" (top-right) to submit a new leave request — select the employee, leave type, and date range.',
          'Review pending requests and update their status to Approved or Rejected.',
        ],
      },
      {
        id: 'payroll',
        title: 'Payroll',
        what: 'Processes monthly salary calculations and generates payslips and salary sheets.',
        steps: [
          'Go to HR & Payroll → Payroll.',
          'Use "Manage Payroll" to run/review payroll for a given month — this accounts for attendance, leaves, and loan deductions.',
          'Generate a Payslip for an individual employee to print/share.',
          'Generate a Salary Sheet for a consolidated view of all employees\' pay for the month.',
          'Once processed, payroll status moves from Pending/Processed to Paid.',
        ],
      },
      {
        id: 'loans',
        title: 'Loans & Advances',
        what: 'Tracks employee loans/advances and their repayment, which feed into payroll deductions.',
        steps: [
          'Go to HR & Payroll → Loans.',
          'Click "Add Loan" (top-right) to record a new loan — employee, amount, and repayment terms.',
          'Click the edit icon on a row to adjust a loan\'s details (e.g. remaining balance after a repayment).',
          'Active loans are automatically considered when Payroll is processed.',
        ],
      },
    ],
  },
];

/** Flat list of every topic with section context, used for search. */
export const HELP_SEARCH_INDEX = HELP_SECTIONS.flatMap(section =>
  section.topics.map(topic => ({
    sectionId: section.id,
    sectionLabel: section.label,
    topicId: topic.id,
    title: topic.title,
    what: topic.what,
    haystack: [
      section.label,
      topic.title,
      topic.what,
      ...(topic.steps || []),
      ...(topic.tips || []),
    ].join(' ').toLowerCase(),
  }))
);
