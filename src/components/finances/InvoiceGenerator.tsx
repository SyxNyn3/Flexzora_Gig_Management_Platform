import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { Payment, Gig } from '@/lib/types';
import {
  FileText,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface InvoiceGeneratorProps {
  payment?: Payment;
  gig?: Gig;
}

interface InvoiceData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone: string;
  workerName: string;
  workerAddress: string;
  workerEmail: string;
  workerPhone: string;
  items: {
    description: string;
    quantity: number;
    rate: number;
    amount: number;
  }[];
  notes: string;
  terms: string;
  subtotal: number;
  tax: number;
  total: number;
}

const InvoiceGenerator: React.FC<InvoiceGeneratorProps> = ({ payment, gig }) => {
  const { profile } = useAuth();
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState<InvoiceData>({
    invoiceNumber: payment?.invoice_number || `INV-${Date.now().toString().slice(-6)}`,
    issueDate: format(new Date(), 'yyyy-MM-dd'),
    dueDate: payment?.due_date ? format(new Date(payment.due_date), 'yyyy-MM-dd') : format(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    companyName: gig?.company?.name || '',
    companyAddress: gig?.company?.address || '',
    companyEmail: gig?.company?.contact_email || '',
    companyPhone: gig?.company?.contact_phone || '',
    workerName: profile?.full_name || '',
    workerAddress: profile?.location || '',
    workerEmail: profile?.email || '',
    workerPhone: profile?.phone || '',
    items: [
      {
        description: gig?.title || 'Professional Services',
        quantity: payment ? 1 : 0,
        rate: payment?.amount || 0,
        amount: payment?.amount || 0,
      },
    ],
    notes: payment?.notes || '',
    terms: 'Payment due within 14 days of invoice date.',
    subtotal: payment?.amount || 0,
    tax: 0,
    total: payment?.amount || 0,
  });

  const updateInvoiceItem = (index: number, field: string, value: any) => {
    const updatedItems = [...invoiceData.items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
    };

    // Recalculate amount if quantity or rate changed
    if (field === 'quantity' || field === 'rate') {
      updatedItems[index].amount = updatedItems[index].quantity * updatedItems[index].rate;
    }

    // Recalculate subtotal and total
    const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);
    const total = subtotal + invoiceData.tax;

    setInvoiceData({
      ...invoiceData,
      items: updatedItems,
      subtotal,
      total,
    });
  };

  const addInvoiceItem = () => {
    const updatedItems = [
      ...invoiceData.items,
      {
        description: '',
        quantity: 1,
        rate: 0,
        amount: 0,
      },
    ];

    setInvoiceData({
      ...invoiceData,
      items: updatedItems,
    });
  };

  const removeInvoiceItem = (index: number) => {
    if (invoiceData.items.length <= 1) {
      toast.error('Invoice must have at least one item');
      return;
    }

    const updatedItems = invoiceData.items.filter((_, i) => i !== index);
    const subtotal = updatedItems.reduce((sum, item) => sum + item.amount, 0);
    const total = subtotal + invoiceData.tax;

    setInvoiceData({
      ...invoiceData,
      items: updatedItems,
      subtotal,
      total,
    });
  };

  const updateTax = (value: number) => {
    setInvoiceData({
      ...invoiceData,
      tax: value,
      total: invoiceData.subtotal + value,
    });
  };

  const generateInvoice = () => {
    setLoading(true);
    
    try {
      // Create a new PDF document
      const doc = new jsPDF();
      
      // Add company logo or title
      doc.setFontSize(24);
      doc.setTextColor(44, 62, 80);
      doc.text('INVOICE', 105, 20, { align: 'center' });
      
      // Add invoice details
      doc.setFontSize(10);
      doc.setTextColor(52, 73, 94);
      doc.text(`Invoice #: ${invoiceData.invoiceNumber}`, 20, 40);
      doc.text(`Issue Date: ${format(new Date(invoiceData.issueDate), 'MMMM d, yyyy')}`, 20, 45);
      doc.text(`Due Date: ${format(new Date(invoiceData.dueDate), 'MMMM d, yyyy')}`, 20, 50);
      
      // Add company details
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('From:', 20, 65);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(invoiceData.workerName, 20, 70);
      if (invoiceData.workerAddress) doc.text(invoiceData.workerAddress, 20, 75);
      if (invoiceData.workerEmail) doc.text(invoiceData.workerEmail, 20, 80);
      if (invoiceData.workerPhone) doc.text(invoiceData.workerPhone, 20, 85);
      
      // Add client details
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Bill To:', 120, 65);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(invoiceData.companyName, 120, 70);
      if (invoiceData.companyAddress) doc.text(invoiceData.companyAddress, 120, 75);
      if (invoiceData.companyEmail) doc.text(invoiceData.companyEmail, 120, 80);
      if (invoiceData.companyPhone) doc.text(invoiceData.companyPhone, 120, 85);
      
      // Add invoice items table
      const tableColumn = ["Description", "Quantity", "Rate", "Amount"];
      const tableRows = invoiceData.items.map(item => [
        item.description,
        item.quantity.toString(),
        `$${item.rate.toFixed(2)}`,
        `$${item.amount.toFixed(2)}`
      ]);
      
      // @ts-ignore - jspdf-autotable types are not included
      doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 95,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [52, 73, 94], textColor: [255, 255, 255] },
        columnStyles: {
          0: { cellWidth: 90 },
          1: { cellWidth: 25, halign: 'center' },
          2: { cellWidth: 35, halign: 'right' },
          3: { cellWidth: 35, halign: 'right' },
        },
      });
      
      // @ts-ignore - get the y position after the table
      const finalY = (doc as any).lastAutoTable.finalY || 120;
      
      // Add totals
      doc.setFontSize(10);
      doc.text('Subtotal:', 140, finalY + 10);
      doc.text(`$${invoiceData.subtotal.toFixed(2)}`, 175, finalY + 10, { align: 'right' });
      
      if (invoiceData.tax > 0) {
        doc.text('Tax:', 140, finalY + 15);
        doc.text(`$${invoiceData.tax.toFixed(2)}`, 175, finalY + 15, { align: 'right' });
      }
      
      doc.setFont('helvetica', 'bold');
      doc.text('Total:', 140, finalY + 20);
      doc.text(`$${invoiceData.total.toFixed(2)}`, 175, finalY + 20, { align: 'right' });
      
      // Add notes and terms
      if (invoiceData.notes) {
        doc.setFont('helvetica', 'bold');
        doc.text('Notes:', 20, finalY + 35);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(invoiceData.notes, 20, finalY + 40);
      }
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Terms & Conditions:', 20, finalY + 55);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(invoiceData.terms, 20, finalY + 60);
      
      // Add footer
      doc.setFontSize(8);
      doc.setTextColor(128, 128, 128);
      doc.text('Generated by FlexZora - Professional Gig Management Platform', 105, 285, { align: 'center' });
      
      // Save the PDF
      doc.save(`Invoice_${invoiceData.invoiceNumber}.pdf`);
      
      toast.success('Invoice generated successfully!');
      setShowInvoiceDialog(false);
    } catch (error) {
      console.error('Error generating invoice:', error);
      toast.error('Failed to generate invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Button 
        variant="outline" 
        onClick={() => setShowInvoiceDialog(true)}
        className="flex items-center"
      >
        <FileText className="h-4 w-4 mr-2" />
        Generate Invoice
      </Button>

      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Invoice</DialogTitle>
            <DialogDescription>
              Create a professional invoice for your services
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Invoice Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="invoiceNumber">Invoice Number</Label>
                <Input
                  id="invoiceNumber"
                  value={invoiceData.invoiceNumber}
                  onChange={(e) => setInvoiceData({ ...invoiceData, invoiceNumber: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="issueDate">Issue Date</Label>
                <Input
                  id="issueDate"
                  type="date"
                  value={invoiceData.issueDate}
                  onChange={(e) => setInvoiceData({ ...invoiceData, issueDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={invoiceData.dueDate}
                  onChange={(e) => setInvoiceData({ ...invoiceData, dueDate: e.target.value })}
                />
              </div>
            </div>

            {/* From and To */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* From (Worker) */}
              <div className="space-y-4">
                <div className="flex items-center">
                  <User className="h-5 w-5 mr-2 text-gray-500" />
                  <h3 className="font-medium">From (Your Details)</h3>
                </div>
                <div>
                  <Label htmlFor="workerName">Name</Label>
                  <Input
                    id="workerName"
                    value={invoiceData.workerName}
                    onChange={(e) => setInvoiceData({ ...invoiceData, workerName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="workerAddress">Address</Label>
                  <Input
                    id="workerAddress"
                    value={invoiceData.workerAddress}
                    onChange={(e) => setInvoiceData({ ...invoiceData, workerAddress: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="workerEmail">Email</Label>
                    <Input
                      id="workerEmail"
                      value={invoiceData.workerEmail}
                      onChange={(e) => setInvoiceData({ ...invoiceData, workerEmail: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="workerPhone">Phone</Label>
                    <Input
                      id="workerPhone"
                      value={invoiceData.workerPhone}
                      onChange={(e) => setInvoiceData({ ...invoiceData, workerPhone: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* To (Company) */}
              <div className="space-y-4">
                <div className="flex items-center">
                  <Building className="h-5 w-5 mr-2 text-gray-500" />
                  <h3 className="font-medium">Bill To (Client)</h3>
                </div>
                <div>
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={invoiceData.companyName}
                    onChange={(e) => setInvoiceData({ ...invoiceData, companyName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="companyAddress">Address</Label>
                  <Input
                    id="companyAddress"
                    value={invoiceData.companyAddress}
                    onChange={(e) => setInvoiceData({ ...invoiceData, companyAddress: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="companyEmail">Email</Label>
                    <Input
                      id="companyEmail"
                      value={invoiceData.companyEmail}
                      onChange={(e) => setInvoiceData({ ...invoiceData, companyEmail: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="companyPhone">Phone</Label>
                    <Input
                      id="companyPhone"
                      value={invoiceData.companyPhone}
                      onChange={(e) => setInvoiceData({ ...invoiceData, companyPhone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Invoice Items */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">Invoice Items</h3>
                <Button size="sm" variant="outline" onClick={addInvoiceItem}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
              
              <div className="space-y-4">
                {invoiceData.items.map((item, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Input
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateInvoiceItem(index, 'description', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Quantity"
                        value={item.quantity}
                        onChange={(e) => updateInvoiceItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Rate"
                        value={item.rate}
                        onChange={(e) => updateInvoiceItem(index, 'rate', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Amount"
                        value={item.amount}
                        disabled
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => removeInvoiceItem(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal:</span>
                  <span>${invoiceData.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Tax:</span>
                  <Input
                    type="number"
                    className="w-24 text-right"
                    value={invoiceData.tax}
                    onChange={(e) => updateTax(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="flex justify-between font-bold border-t pt-2">
                  <span>Total:</span>
                  <span>${invoiceData.total.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Notes and Terms */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional notes for the client..."
                  rows={3}
                  value={invoiceData.notes}
                  onChange={(e) => setInvoiceData({ ...invoiceData, notes: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="terms">Terms & Conditions</Label>
                <Textarea
                  id="terms"
                  placeholder="Payment terms and conditions..."
                  rows={3}
                  value={invoiceData.terms}
                  onChange={(e) => setInvoiceData({ ...invoiceData, terms: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceDialog(false)}>
              Cancel
            </Button>
            <Button onClick={generateInvoice} disabled={loading}>
              <Download className="h-4 w-4 mr-2" />
              {loading ? 'Generating...' : 'Generate PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvoiceGenerator;