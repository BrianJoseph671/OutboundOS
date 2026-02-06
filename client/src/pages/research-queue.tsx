import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, ArrowLeft, User, Building2, Zap, MessageSquare, Loader2 } from "lucide-react";
import type { Contact } from "@shared/schema";

interface PlaceholderResearch {
  prospectSnapshot: string;
  companySnapshot: string;
  signalsAndHooks: string[];
  personalizedMessage: string;
}

function buildPlaceholderResearch(contactName: string): PlaceholderResearch {
  return {
    prospectSnapshot: `${contactName} — placeholder prospect snapshot. Key role and background will appear here after research.`,
    companySnapshot: "Company overview placeholder. Industry, size, recent news and relevance will appear here.",
    signalsAndHooks: [
      "Recent LinkedIn activity or post",
      "Shared connection or alma mater",
      "Company initiative or product launch",
    ],
    personalizedMessage: "Hi [Name], I noticed [hook]. I’d love to connect because [value prop]. Would you be open to a brief conversation?",
  };
}

export default function ResearchQueue() {
  const [location, setLocation] = useLocation();
  const ids = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    const idParam = p.get("ids");
    return idParam ? idParam.split(",").map((id) => id.trim()).filter(Boolean) : [];
  }, [location]);

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const queueContacts = useMemo(() => {
    if (ids.length === 0) return [];
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)).filter((c): c is Contact => c != null);
  }, [ids, contacts]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [researchReady, setResearchReady] = useState(false);

  const contact = queueContacts[currentIndex] ?? null;
  const placeholderResearch = contact ? buildPlaceholderResearch(contact.name) : null;

  useEffect(() => {
    if (!contact) return;
    setResearchReady(false);
    const delay = 800 + Math.random() * 700;
    const t = setTimeout(() => setResearchReady(true), delay);
    return () => clearTimeout(t);
  }, [currentIndex, contact?.id]);

  if (ids.length === 0 || queueContacts.length === 0) {
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
            <Button className="mt-4" onClick={() => setLocation("/contacts")}>
              Back to Contacts
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (contactsLoading) {
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
          <h1 className="text-2xl font-semibold">Research Queue</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={!canGoPrev}
            aria-label="Previous contact"
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
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {contact && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-lg">{contact.name}</CardTitle>
              {contact.company && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {contact.company}
                </Badge>
              )}
            </div>
            {contact.role && (
              <p className="text-sm text-muted-foreground">{contact.role}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {!researchReady ? (
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Researching…</span>
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            ) : placeholderResearch ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                    <User className="w-4 h-4" />
                    Prospect Snapshot
                  </h3>
                  <p className="text-sm text-muted-foreground">{placeholderResearch.prospectSnapshot}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4" />
                    Company Snapshot
                  </h3>
                  <p className="text-sm text-muted-foreground">{placeholderResearch.companySnapshot}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4" />
                    Signals & Hooks
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    {placeholderResearch.signalsAndHooks.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4" />
                    Personalized Message
                  </h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{placeholderResearch.personalizedMessage}</p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
