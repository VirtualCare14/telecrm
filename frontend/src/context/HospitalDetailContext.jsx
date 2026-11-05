import React, { createContext, useContext, useState, useCallback } from 'react';
import HospitalDetailDrawer from '../components/HospitalDetailDrawer';

const HospitalDetailContext = createContext(null);

export function HospitalDetailProvider({ children }) {
  const [open, setOpen] = useState(false);
  const [leadId, setLeadId] = useState(null);
  const [initialLead, setInitialLead] = useState(null);

  const openHospitalDetail = useCallback((leadOrId, fallbackData = null) => {
    if (!leadOrId) return;

    if (typeof leadOrId === 'object') {
      const id = leadOrId._id || leadOrId.id || leadOrId.leadId;
      if (!id) return;
      setLeadId(String(id));
      setInitialLead(leadOrId);
    } else {
      setLeadId(String(leadOrId));
      setInitialLead(fallbackData || null);
    }
    setOpen(true);
  }, []);

  const closeHospitalDetail = useCallback(() => {
    setOpen(false);
    // Delay clearing lead data until transition completes to prevent visual flash
    setTimeout(() => {
      setLeadId(null);
      setInitialLead(null);
    }, 300);
  }, []);

  const handleLeadUpdated = useCallback((updatedLead) => {
    // Notify all dashboards, lists, and tables across the application to refresh
    window.dispatchEvent(
      new CustomEvent('telecrm:lead-updated', {
        detail: { leadId: updatedLead?._id || leadId, lead: updatedLead },
      })
    );
  }, [leadId]);

  return (
    <HospitalDetailContext.Provider value={{ openHospitalDetail, closeHospitalDetail }}>
      {children}
      <HospitalDetailDrawer
        open={open}
        leadId={leadId}
        initialLead={initialLead}
        onClose={closeHospitalDetail}
        onLeadUpdated={handleLeadUpdated}
      />
    </HospitalDetailContext.Provider>
  );
}

export function useHospitalDetail() {
  const ctx = useContext(HospitalDetailContext);
  if (!ctx) {
    throw new Error('useHospitalDetail must be used within a HospitalDetailProvider');
  }
  return ctx;
}

export default HospitalDetailContext;

