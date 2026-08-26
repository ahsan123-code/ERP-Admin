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
    summary: 'The full purchase cycle — PDN → Requisition → Purchase Order → Gate Pass → GRN → Purchase Invoice.',
    topics: [
      {
        id: 'overview',
        title: 'Procurement workflow overview',
        what: 'The procurement module follows a step-by-step chain across 7 tabs: Demand Notes → Requisitions → Purchase Orders → Gate Pass Inward → GRNs → Purchase Invoices → Vendors. Each tab has its own "New" button and table.',
        steps: [
          'Open Procurement from the sidebar — four summary cards at the top show Active POs, Pending PDNs, Active Vendors, and Pending GRNs.',
          'Click any of the 7 tabs along the top (Demand Notes, Requisitions, Purchase Orders, Gate Pass Inward, GRNs, Purchase Invoices, Vendors) to switch views.',
          'Start a purchase by raising a PDN (Demand Notes tab) — the full flow then proceeds through each tab in order.',
          'Each document type links back to the previous one using reference numbers (PDN Ref, PR Ref, PO Ref, GP Ref) so you can trace a purchase from start to finish.',
        ],
        tips: [
          'You can also raise a direct Purchase Order (without a PDN or Requisition) if the purchase is straightforward.',
        ],
      },
      {
        id: 'pdn',
        title: 'Step 1 — Purchase Demand Note (PDN)',
        what: 'A PDN is the first document in the purchase cycle — an internal request from a department saying "we need to buy these items." It does not go to the vendor directly.',
        steps: [
          'Go to Procurement → Demand Notes tab.',
          'Click "New PDN" (top-right).',
          'Select the requesting department, set priority (Low / Medium / High), and add the items and quantities needed.',
          'Save — the PDN appears with status "Submitted" and is now ready to be converted to a Requisition or Purchase Order.',
          'To delete a PDN entered by mistake, click the red trash icon on its row.',
        ],
        tips: [
          'PDN number is auto-generated (format: PDN-XXXX). Note it down — you will reference it when creating the Requisition or PO.',
        ],
      },
      {
        id: 'requisition',
        title: 'Step 2 — Purchase Requisition (PR)',
        what: 'A Purchase Requisition is a formal internal approval document that upgrades a PDN into an authorized purchase request. Once approved, it feeds directly into a Purchase Order.',
        steps: [
          'Go to Procurement → Requisitions tab.',
          'Click "New Requisition" (top-right).',
          'Fill in the department, the name of who is requesting (Requested By), and priority.',
          'Optionally link the Requisition to an existing PDN using the "PDN Reference" field (type to search).',
          'Add the items required using the product search — select from the product catalogue, enter quantity and unit.',
          'Click "Submit Requisition" — it appears with status "Submitted" and a PR number (e.g. PR-123456).',
        ],
        tips: [
          'If no PDN exists, you can create a Requisition directly without linking it to one.',
        ],
      },
      {
        id: 'purchase-order',
        title: 'Step 3 — Purchase Order (PO)',
        what: 'A Purchase Order is a formal document sent to the vendor committing to buy specific goods at agreed prices and quantities. This is the document the vendor uses to prepare and dispatch the goods.',
        steps: [
          'Go to Procurement → Purchase Orders tab.',
          'Click "New Purchase Order" (top-right).',
          'Set the PO Date and Delivery Due Date.',
          'Select the Vendor (type to search the vendor list).',
          'Optionally link to a Requisition (PR Ref) or PDN (PDN Ref) to maintain the paper trail.',
          'Add line items: select each product, enter quantity, unit, and unit price — the total auto-calculates.',
          'Select Payment Terms (Net 30, Advance, COD, etc.).',
          'Click "Issue PO" — the PO is created with status "Issued" and the grand total is shown.',
        ],
        tips: [
          'A PO number (e.g. PO-123456) is auto-generated. Share this with your vendor as the order reference.',
          'Use the "All / Active / Completed" filter tabs to monitor open vs. fulfilled POs.',
        ],
      },
      {
        id: 'gate-pass-inward',
        title: 'Step 4 — Gate Pass Inward',
        what: 'When the vendor\'s vehicle arrives at your premises, a Gate Pass Inward is issued at the gate — recording the vehicle number, driver details, and which PO the goods relate to. This is the security checkpoint before goods are formally received.',
        steps: [
          'Go to Procurement → Gate Pass Inward tab.',
          'Click "New Gate Pass" (top-right).',
          'Set the gate date and time.',
          'Select the linked Purchase Order from the dropdown — the vendor name auto-fills.',
          'Enter the vehicle number and driver\'s name (required) and driver\'s mobile (optional).',
          'Enter the name of the gatekeeper/store keeper receiving the vehicle.',
          'Add any remarks (e.g. seal intact, documents received).',
          'Click "Create Gate Pass" — a GP number is generated (e.g. GPI-123456).',
        ],
        tips: [
          'The gate pass can be created without linking to a PO (e.g. for unannounced deliveries) — just fill in the vendor name manually.',
        ],
      },
      {
        id: 'grn',
        title: 'Step 5 — Goods Receipt Note (GRN)',
        what: 'A GRN is a formal record of what was actually received from the vendor — item by item, ordered quantity vs. received quantity, unit price, and which warehouse it went into. This is the document that confirms goods are in stock.',
        steps: [
          'Go to Procurement → GRNs tab.',
          'Click "New GRN" (top-right).',
          'Set the date received.',
          'Link to the Purchase Order (PO Ref) and Gate Pass Inward (GP Ref) — the vendor name auto-fills.',
          'Enter the name of the store keeper who received the goods and the warehouse they were stored in.',
          'Add items received: for each item, enter the ordered quantity, the actual received quantity (these may differ if goods are short-shipped), unit, and unit price.',
          'Add any remarks about the condition or shortages.',
          'Click "Post GRN" — status is set to "Posted" and the total value is calculated.',
        ],
        tips: [
          'Always cross-check Ordered Qty vs. Received Qty — if goods are short, record only what actually arrived. Follow up with the vendor for the balance.',
          'After posting a GRN, update Inventory (Inventory → New Item) to add the received quantities to stock.',
        ],
      },
      {
        id: 'purchase-invoice',
        title: 'Step 6 — Purchase Invoice (Vendor Bill)',
        what: 'A Purchase Invoice records the vendor\'s bill against the goods received. This creates a payable in the system and is the final document in the purchase cycle before payment is made.',
        steps: [
          'Go to Procurement → Purchase Invoices tab.',
          'Click "New Purchase Invoice" (top-right).',
          'Enter the vendor\'s own invoice number in "Vendor Invoice No." (the number printed on the vendor\'s bill).',
          'Set the bill date and the due date for payment.',
          'Link to the Purchase Order (PO Ref) and GRN (GRN Ref) — the vendor name and amounts auto-fill from those records.',
          'Enter the Items Total (net amount before tax), Tax/GST amount, and Grand Total — Grand Total auto-calculates from the first two fields.',
          'Select Payment Terms and add any notes.',
          'Click "Record Bill" — the purchase invoice is saved with status "Unpaid".',
        ],
        tips: [
          'The Bill ID (e.g. PBILL-12345) is the system\'s internal reference. The vendor\'s own invoice number goes in "Vendor Invoice No."',
          'Once the vendor is paid, update the status to "Paid" to keep your payables accurate.',
        ],
      },
      {
        id: 'vendors',
        title: 'Vendors',
        what: 'The master list of all suppliers — name, NTN, contact, category, and active/inactive status. Active vendors are available for selection when creating POs.',
        steps: [
          'Go to Procurement → Vendors tab.',
          'Search for a vendor by name or NTN using the search box.',
          'Inactive vendors (red "Inactive" badge) cannot be selected for new orders — contact the admin to reactivate if needed.',
          'Use vendor NTN and contact details from here when filing tax documents.',
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
        title: 'Sales Invoice (created via Dispatch)',
        what: 'A Sales Invoice is automatically generated when you dispatch a sales order. It captures the subtotal plus all additional charges — freight, loading/unloading, packing, toll tax, slitting — and calculates the grand total.',
        steps: [
          'Sales invoices are created automatically during the Dispatch step (Sales & CRM → Deliveries → click Dispatch on a confirmed order).',
          'During dispatch you enter the freight, loading/unloading, packing, toll tax, and slitting charges — these become the invoice charges.',
          'Also on the dispatch form, enter the Manual Bill No. (Book #) — the number written on the physical bill book. It prints on the sale bill as "Book #". Leave it blank if you do not have it yet.',
          'Once dispatched, the invoice appears immediately in Invoicing → Sales Invoices tab.',
          'Go to Invoicing → Sales Invoices to view, search, and print any invoice.',
          'Click "Print" on an invoice row to open the print view — shows company header, customer, SO/DN reference, charge breakdown, and grand total.',
        ],
        tips: [
          'You do not create sales invoices manually in the Invoicing module — they come from the dispatch action here in Sales & CRM.',
          'If the Book # was not to hand at dispatch, click the Book # cell on any row in Invoicing → Sales Invoices to fill it in or correct it afterwards.',
          'For FBR tax submission (e-invoicing), use Invoicing → FBR Queue → New FBR Invoice separately.',
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
    summary: 'View and print sales invoices, manage FBR e-invoicing, and handle sale-return credit notes.',
    topics: [
      {
        id: 'sales-invoices',
        title: 'Sales Invoices',
        what: 'The main invoice list — shows every sales invoice automatically created when an order is dispatched through Sales & CRM. Each row shows the invoice number, customer, date, SO reference, subtotal, and grand total.',
        steps: [
          'Go to Invoicing → Sales Invoices (the default tab when you open Invoicing).',
          'Invoices are created automatically when you dispatch a sales order in Sales & CRM — you do not need to create them manually here.',
          'Use the "All / Posted" filter tabs to narrow the list.',
          'Search by customer name or invoice number using the search box.',
          'Click "Print" on any row to open a ready-to-print invoice showing company details, customer, order reference, subtotal, additional charges, and grand total.',
        ],
        tips: [
          'The four summary cards at the top show Total Sales Invoices, Posted count, FBR Synced count, and FBR Failed count across all invoice types.',
        ],
      },
      {
        id: 'fbr-queue',
        title: 'FBR Queue',
        what: 'Manages standalone FBR e-invoices (separate from the dispatch-generated sales invoices). Use this tab when you need to submit a tax invoice directly to AJK-IRD for FBR compliance.',
        steps: [
          'Go to Invoicing → FBR Queue.',
          'Click "New FBR Invoice" (top-right) to manually create an FBR-registered invoice with customer NTN/CNIC details.',
          'For invoices shown in the FBR table, check their "FBR Status" (Pending / Synced / Failed).',
          'Click "Submit" on a pending invoice to push it to FBR — the app shows the AJK-IRD service status (Online/Offline) at the top of this tab.',
          'If submission fails, the invoice moves to a "Retry Queue" below — click "Retry" or "Retry All" to reattempt.',
          'A "Synced" invoice has been successfully reported and assigned a Fiscal Invoice Number by FBR.',
        ],
        tips: [
          'The online/offline indicator shows live connectivity to the AJK-IRD fiscal service. Submissions go via cloud fallback when the local service is offline.',
        ],
      },
      {
        id: 'sale-return-invoice',
        title: 'Sale Returns',
        what: 'Credit notes issued against sales invoices when customers return goods. Each credit note links back to the original sale return recorded in Sales & CRM.',
        steps: [
          'Go to Invoicing → Sale Returns tab.',
          'Each row shows Credit Note No., the linked sale-return reference, customer name, date, and tax and total amounts.',
          'Credit notes are created from Sales & CRM → Sales Returns — once a return is recorded there, the credit note appears here.',
          'Use the credit note details when reconciling the customer\'s account in Finance → Vouchers.',
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
        tips: [
          'Payment vouchers (PV and BPV) can be paid to an expense account as well as to a customer or vendor. In the "Paid To" picker, search by account name or code — expense heads are tagged "Expense" in the list.',
          'Use this for anything paid out that does not settle a party balance: rent, utilities, freight, repairs. The voucher debits the expense head and credits the cash or bank it was paid from.',
          'One voucher can mix parties and expense heads across its lines — each line posts against its own account, and the cash/bank side carries their total.',
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
          'Click "New Entry" (top-right) to log an expense — date, category, and description.',
          'In "Expense Accounts", pick every account the payment should be charged to. You can select several: type to search, click to tick, and click a ticked account (or its chip) again to remove it.',
          'Enter what each selected account was charged in "Amount Per Account". The total for the entry is the sum of those amounts.',
          'Choose whether it was paid from Cash In Hand or a bank account, then post it.',
          'Use the running total to know how much of the petty cash float remains.',
        ],
        tips: [
          'One slip often covers more than one expense head — split it across accounts here instead of keying the same description in twice.',
          'The voucher debits each expense account for its own amount and credits the cash or bank once for the total, so every account shows the right figure in Reports → Ledger.',
          'The Expense Accounts column in the list names the head an entry was charged to, or the first one plus a count when it was split.',
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
      {
        id: 'cust-balance',
        title: 'Customer Current Balance',
        what: 'A one-page summary of every customer\'s current outstanding balance — how much they owe (Dr) or have paid in advance (Cr) — along with their last payment date/amount and latest invoice reference. This is the report the client uses for day-to-day receivables follow-up.',
        steps: [
          'Go to Reports → Customer Balance (last tab).',
          'The report splits into two sections automatically: "Debit Balances" (customers who owe money) and "Credit Balances" (customers with advance payments on account).',
          'Each row shows: customer name and contact, current balance (labeled Dr or Cr), last payment date, last payment amount, latest invoice number, invoice date, and invoice amount.',
          'Use the search box at the top to filter by customer name or contact number.',
          'The summary line above the table shows total customers, total net receivable, and whether the balance is Dr or Cr.',
          'Click "Print Report" (top-right of the filter row) to open a full print-ready version of the report — suitable for sharing with management or using for collections follow-up.',
        ],
        tips: [
          'Debit balance = customer owes you money (most common). Credit balance = customer paid in advance and has money sitting on account.',
          'Balances come from the "Outstanding Balance" field on each customer record, which is updated when sales invoices and payments are recorded.',
          'Last Payment is matched by finding Receipt / Bank Receipt vouchers that mention the customer name — make sure vouchers are entered with the customer name in the account or narration.',
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
        what: 'Tracks employee loans and salary advances and their recovery, which feed into payroll deductions. A loan is repaid by monthly installment; an advance is salary paid before payday and taken back out of the coming salary.',
        steps: [
          'Go to HR & Payroll → Loans & Advances. Use the All / Loans / Advances buttons to narrow the list.',
          'Click "Add Loan" to record a new loan — employee, amount, and the monthly installment.',
          'Click "Add Advance" to record salary paid in advance — employee, amount, and the date paid. Leave "Recover Per Month" blank to take the whole amount off the next salary, or set a figure to spread it over several months.',
          'Click any row to adjust it (e.g. the remaining balance after a repayment), or to close it off by setting its status.',
          'Generating Payroll deducts active loan installments as Loan Deduction and outstanding advances as Advance Salary, then writes the recovered amount off the advance — an advance with nothing left closes itself.',
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
