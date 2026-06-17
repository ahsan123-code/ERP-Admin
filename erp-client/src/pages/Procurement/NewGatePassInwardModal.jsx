import { useState, useEffect } from 'react';
import Modal from '../../components/shared/Modal';
import Input from '../../components/ui/Input';
import SelectField from '../../components/ui/SelectField';
import SearchableSelect from '../../components/ui/SearchableSelect';
import Button from '../../components/ui/Button';
import { useToast } from '../../components/shared/Toast';
import { procurementDb } from '../../lib/db';
import { useDb } from '../../hooks/useDb';
import { useCompany } from '../../context/CompanyContext';

const today = () => new Date().toISOString().split('T')[0];
const nowTime = () => new Date().toTimeString().slice(0, 5);
const genGpId = () => 'GPI-' + String(Date.now()).slice(-6);

export default function NewGatePassInwardModal({ open, onClose, onSave }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [saving, setSaving] = useState(false);
  const [gpId, setGpId] = useState(genGpId());
  const [form, setForm] = useState({
    gate_date: today(), gate_time: nowTime(),
    po_ref: '', vendor_name: '',
    vehicle_no: '', driver_name: '', driver_mobile: '',
    received_by: '', remarks: '',
  });

  const { data: purchaseOrders } = useDb(() => procurementDb.getPurchaseOrders(companyId), [companyId]);

  useEffect(() => {
    if (open) {
      setGpId(genGpId());
      setForm({ gate_date: today(), gate_time: nowTime(), po_ref: '', vendor_name: '', vehicle_no: '', driver_name: '', driver_mobile: '', received_by: '', remarks: '' });
    }
  }, [open]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handlePoSelect = (poId) => {
    const po = (purchaseOrders || []).find(p => p.po_id === poId);
    setForm(f => ({ ...f, po_ref: poId, vendor_name: po?.vendor_name || f.vendor_name }));
  };

  const handleSubmit = async () => {
    if (!form.gate_date || !form.vehicle_no || !form.driver_name) {
      toast.error('Date, Vehicle No., and Driver Name are required.'); return;
    }
    setSaving(true);
    try {
      const { data, error } = await procurementDb.addGatePassInward({
        gp_id:        gpId,
        po_ref:       form.po_ref || null,
        vendor_name:  form.vendor_name || null,
        gate_date:    form.gate_date,
        gate_time:    form.gate_time || null,
        vehicle_no:   form.vehicle_no,
        driver_name:  form.driver_name,
        driver_mobile:form.driver_mobile || null,
        received_by:  form.received_by || null,
        remarks:      form.remarks || null,
        status:       'open',
        company_id:   companyId,
      });
      if (error) throw new Error(error.message);
      toast.success(`Gate Pass Inward ${gpId} created.`, 'GP Created');
      onSave({
        ...(data || {}), gp_id: gpId, po_ref: form.po_ref, vendor_name: form.vendor_name,
        gate_date: form.gate_date, vehicle_no: form.vehicle_no, driver_name: form.driver_name, status: 'open',
      });
      onClose();
    } catch (err) {
      toast.error(err.message, 'Save Failed');
    } finally {
      setSaving(false);
    }
  };

  const poOptions = (purchaseOrders || [])
    .filter(p => ['issued', 'partially_received'].includes(p.status))
    .map(p => ({ value: p.po_id, label: `${p.po_id} — ${p.vendor_name}`, hint: p.status }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gate Pass Inward"
      subtitle={`${gpId} — Record incoming goods at the gate`}
      size="md"
      footer={
        <div className="factions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Create Gate Pass'}
          </Button>
        </div>
      }
    >
      <div className="fg">
        <Input label="GP No." value={gpId} readOnly style={{ background: 'var(--bg-tertiary)' }} />
        <Input label="Gate Date *" type="date" value={form.gate_date} onChange={set('gate_date')} required />
        <Input label="Gate Time" type="time" value={form.gate_time} onChange={set('gate_time')} />
        <div className="ff">
          <SearchableSelect
            label="Purchase Order Reference"
            placeholder="Select linked PO..."
            emptyText="No active POs"
            value={form.po_ref}
            onChange={handlePoSelect}
            options={poOptions}
          />
        </div>
        <Input label="Vendor / Supplier" value={form.vendor_name} onChange={set('vendor_name')} placeholder="Vendor name if no PO linked" />
        <Input label="Vehicle No. *" value={form.vehicle_no} onChange={set('vehicle_no')} placeholder="e.g. LHR-1234" required />
        <Input label="Driver Name *" value={form.driver_name} onChange={set('driver_name')} placeholder="Driver full name" required />
        <Input label="Driver Mobile" value={form.driver_mobile} onChange={set('driver_mobile')} placeholder="e.g. 03xx-xxxxxxx" />
        <Input label="Received By (Gatekeeper)" value={form.received_by} onChange={set('received_by')} placeholder="Guard / store keeper name" />
        <div className="ff">
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Remarks</label>
          <textarea
            value={form.remarks}
            onChange={set('remarks')}
            rows={2}
            placeholder="Seal condition, documents received, etc."
            style={{
              width: '100%', background: 'var(--input-bg)', border: '1px solid var(--input-border)',
              borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', padding: '10px 14px',
              fontFamily: 'var(--font-ui)', fontSize: 13, resize: 'vertical', outline: 'none',
            }}
          />
        </div>
      </div>
    </Modal>
  );
}
