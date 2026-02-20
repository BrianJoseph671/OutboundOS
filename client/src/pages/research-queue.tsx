import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useContacts } from "@/hooks/useContacts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowLeft, User, Building2, Zap, MessageSquare, Loader2, Copy, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Contact } from "@shared/schema";

export interface ResearchPacket {
  prospectSnapshot: string;
  companySnapshot: string;
  signalsHooks: string[];
  messageDraft: string;
}

type ApiResearchPacket = {
  contactId: string;
  status: string;
  prospectSnapshot: string | null;
  companySnapshot: string | null;
  signalsHooks: string[];
  personalizedMessage: string | null;
  variants: unknown[];
};

export default function ResearchQueue() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const ids = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    const idParam = p.get("ids");
    return idParam ? idParam.split(",").map((id) => id.trim()).filter(Boolean) : [];
  }, [location]);

  const { contacts, isLoading: contactsLoading } = useContacts();

  const { data: packetsData, isLoading: packetsLoading } = useQuery<{ packets: ApiResearchPacket[] }>({
    queryKey: ["/api/research-packets", ids.join(",")],
    queryFn: async () => {
      if (ids.length === 0) return { packets: [] };
      const res = await apiRequest("GET", `/api/research-packets?contactIds=${encodeURIComponent(ids.join(","))}`);
      return res.json();
    },
    enabled: ids.length > 0,
  });

  const packetsByContactId = useMemo(() => {
    const map = new Map<string, ApiResearchPacket>();
    for (const p of packetsData?.packets ?? []) {
      map.set(p.contactId, p);
    }
    return map;
  }, [packetsData?.packets]);

  const queueContacts = useMemo(() => {
    if (ids.length === 0) return [];
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)).filter((c): c is Contact => c != null);
  }, [ids, contacts]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const contact = queueContacts[currentIndex] ?? null;
  const apiPacket = contact ? packetsByContactId.get(contact.id) : null;
  const packet: ResearchPacket | null = apiPacket
    ? {
        prospectSnapshot: apiPacket.prospectSnapshot ?? "",
        companySnapshot: apiPacket.companySnapshot ?? "",
        signalsHooks: Array.isArray(apiPacket.signalsHooks) ? apiPacket.signalsHooks : [],
        messageDraft: apiPacket.personalizedMessage ?? "",
      }
    : null;
  const packetStatus = apiPacket?.status ?? "not_started";
  const hasResearch = packetStatus === "complete" && packet !== null;

  const handleCopy = useCallback(async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopiedSection(null), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  }, [toast]);

  if (ids.length === 0 || (queueContacts.length === 0 && !contactsLoading)) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/contacts")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Contacts
          </Button>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {ids.length === 0 ? "No contacts selected." : "No contacts found for the selected IDs."}
            </p>
            <Button className="mt-4" onClick={() => setLocation("/contacts")} data-testid="button-back-contacts-empty">
              Back to Contacts
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (contactsLoading || (ids.length > 0 && packetsLoading)) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/contacts")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Contacts
          </Button>
        </div>
        <Card>
          <CardContent className="py-12">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading contacts...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < queueContacts.length - 1;

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/contacts")} data-testid="button-back-to-contacts">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Contacts
          </Button>
          <h1 className="text-2xl font-semibold">Research Results</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={!canGoPrev}
            aria-label="Previous contact"
            data-testid="button-prev-contact"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[100px] text-center">
            Contact {currentIndex + 1} of {queueContacts.length}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentIndex((i) => Math.min(queueContacts.length - 1, i + 1))}
            disabled={!canGoNext}
            aria-label="Next contact"
            data-testid="button-next-contact"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {contact && (
        <div className="space-y-6">
          <Card className="bg-primary/5 border-primary/20 shadow-md ring-1 ring-primary/10">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold text-primary">{contact.name}</h2>
              {contact.role && (
                <p className="text-sm text-foreground/90 mt-1">{contact.role}</p>
              )}
              {contact.company && (
                <p className="text-sm text-foreground/80 mt-0.5 flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  {contact.company}
                </p>
              )}
            </CardContent>
          </Card>

          {packetStatus === "queued" || packetStatus === "researching" ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm">
                    {packetStatus === "queued" ? "Research queued..." : "Researching..."}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : packetStatus === "failed" ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <AlertCircle className="w-8 h-8" />
                  <p className="text-sm">Research failed for this contact.</p>
                  <p className="text-xs">Run bulk research again from the Contacts page to retry.</p>
                </div>
              </CardContent>
            </Card>
          ) : !hasResearch ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <AlertCircle className="w-8 h-8" />
                  <p className="text-sm">No research data available for this contact yet.</p>
                  <p className="text-xs">Run bulk research from the Contacts page to populate this data.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {packet!.prospectSnapshot && (
                <Card data-testid="card-prospect-snapshot">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Prospect Snapshot
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(packet!.prospectSnapshot, "prospect")}
                        data-testid="button-copy-prospect"
                      >
                        {copiedSection === "prospect" ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{packet!.prospectSnapshot}</p>
                  </CardContent>
                </Card>
              )}

              {packet!.companySnapshot && (
                <Card data-testid="card-company-snapshot">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Company Snapshot
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(packet!.companySnapshot, "company")}
                        data-testid="button-copy-company"
                      >
                        {copiedSection === "company" ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{packet!.companySnapshot}</p>
                  </CardContent>
                </Card>
              )}

              {packet!.signalsHooks.length > 0 && (
                <Card data-testid="card-signals-hooks">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Zap className="w-4 h-4" />
                        Signals & Hooks
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(packet!.signalsHooks.join("\n"), "signals")}
                        data-testid="button-copy-signals"
                      >
                        {copiedSection === "signals" ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      {packet!.signalsHooks.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {packet!.messageDraft && (
                <Card className="bg-primary/5 border-primary/20 shadow-md ring-1 ring-primary/10" data-testid="card-message-draft">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MessageSquare className="w-4 h-4" />
                        Personalized Message
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(packet!.messageDraft, "message")}
                        data-testid="button-copy-message"
                      >
                        {copiedSection === "message" ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{packet!.messageDraft}</p>
                  </CardContent>
                </Card>
              )}

              {!packet!.prospectSnapshot && !packet!.companySnapshot && packet!.signalsHooks.length === 0 && !packet!.messageDraft && (
                <Card>
                  <CardContent className="py-8">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <AlertCircle className="w-8 h-8" />
                      <p className="text-sm">Research completed but no structured data was returned.</p>
                      <p className="text-xs">The webhook may need to be configured to return prospectSnapshot, companySnapshot, signalsHooks, and messageDraft fields.</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
