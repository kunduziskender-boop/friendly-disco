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
