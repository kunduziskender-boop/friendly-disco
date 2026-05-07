export type Client = {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  createdAt: string;
};

export type CaseStatus = "новое" | "в работе" | "суд" | "закрыто";

export type LegalCase = {
  id: string;
  clientId: string;
  title: string;
  courtOrAuthority: string;
  status: CaseStatus;
  nextDeadline: string;
  summary: string;
};

export type Appointment = {
  id: string;
  clientId: string;
  title: string;
  at: string;
  place: string;
};

export type CrmState = {
  clients: Client[];
  cases: LegalCase[];
  appointments: Appointment[];
};

export type FinanceType = "payment" | "expense" | "refund";
export type FinanceStatus = "pending" | "paid" | "cancelled";

export type FinanceRecord = {
  id: string;
  recordType: FinanceType;
  amount: number;
  currency: string;
  paymentDate: string;
  status: FinanceStatus;
  clientId: string | null;
  caseId: string | null;
  description: string | null;
  createdAt: string;
};
