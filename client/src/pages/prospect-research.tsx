import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Copy, Check, User, Building2, Trash2, Sparkles, LogIn, ExternalLink, UserPlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useLocation } from "wouter";

interface ParsedSection {
  title: string;
  content: string;
  isDraftMessage: boolean;
}

interface ResearchResponse {
  output: Array<{
    content: Array<{ text: string }>;
  }>;
}

export default function ProspectResearch() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Initialize from localStorage
  const [personName, setPersonName] = useState(() => 
    localStorage.getItem("prospect-research-name") || ""
  );
  const [company, setCompany] = useState(() => 
    localStorage.getItem("prospect-research-company") || ""
  );
  const [researchResult, setResearchResult] = useState<string | null>(() => 
    localStorage.getItem("prospect-research-result")
  );
  const [copied, setCopied] = useState(false);
  const [, setLocation] = useLocation();

  // Sync with localStorage
  useEffect(() => {
    localStorage.setItem("prospect-research-name", personName);
  }, [personName]);

  useEffect(() => {
    localStorage.setItem("prospect-research-company", company);
  }, [company]);

  useEffect(() => {
    if (researchResult) {
      localStorage.setItem("prospect-research-result", researchResult);
    } else {
      localStorage.removeItem("prospect-research-result");
    }
  }, [researchResult]);

  const researchMutation = useMutation({
    mutationFn: async (data: { personName: string; company: string }) => {
      const response = await apiRequest("POST", "/api/prospect-research", data);
      return response.json() as Promise<ResearchResponse>;
    },
    onSuccess: (data) => {
      const text = data?.output?.[0]?.content?.[0]?.text || "";
      setResearchResult(text);
      if (text) {
        toast({ title: "Research complete" });
      } else {
        toast({ title: "No results found", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Research failed", description: "Please try again", variant: "destructive" });
    },
  });

  const addContactMutation = useMutation({
    mutationFn: async () => {
      if (!researchResult) throw new Error("No research data");
      
      const sections = parseResearchSections(researchResult);
      const snapshot = sections.find(s => s.title.includes("Prospect Snapshot"))?.content || "";
      
      // Extract details using basic regex from the snapshot
      const titleMatch = snapshot.match(/Title:\s*([^\n]+)/i);
      const headlineMatch = snapshot.match(/Headline:\s*([^\n]+)/i);
      const aboutMatch = snapshot.match(/About:\s*([^\n]+)/i);
      const locationMatch = snapshot.match(/Location:\s*([^\n]+)/i);
      const experienceMatch = sections.find(s => s.title.includes("Experience"))?.content || "";
      const educationMatch = snapshot.match(/Background:\s*([^\n]+)/i);
      
      const contactData = {
        name: personName,
        company: company,
        role: titleMatch?.[1]?.trim() || null,
        headline: headlineMatch?.[1]?.trim() || titleMatch?.[1]?.trim() || null,
        about: aboutMatch?.[1]?.trim() || null,
        location: locationMatch?.[1]?.trim() || null,
        experience: experienceMatch || null,
        education: educationMatch?.[1]?.trim() || null,
        tags: "research-import"
      };

      return apiRequest("POST", "/api/contacts", contactData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ 
        title: "Contact added", 
        description: `${personName} from ${company} has been added to your contacts.` 
      });
    },
    onError: (error) => {
      toast({ 
        title: "Failed to add contact", 
        description: "There was an error adding this prospect to your contacts.",
        variant: "destructive" 
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personName.trim() || !company.trim()) {
      toast({ title: "Please fill in both fields", variant: "destructive" });
      return;
    }
    researchMutation.mutate({ personName: personName.trim(), company: company.trim() });
  };

  const handleClear = () => {
    setPersonName("");
    setCompany("");
    setResearchResult(null);
    localStorage.removeItem("prospect-research-name");
    localStorage.removeItem("prospect-research-company");
    localStorage.removeItem("prospect-research-result");
    toast({ title: "Research data cleared" });
  };

  const parseResearchSections = (markdown: string): ParsedSection[] => {
    const sections: ParsedSection[] = [];
    
    // Normalize markdown to help with parsing
    const normalizedMarkdown = markdown.replace(/\r\n/g, "\n");

    // Comprehensive list of headers to look for
    const knownHeaders = [
      "Prospect Snapshot", 
      "Company Snapshot", 
      "Connection Angles", 
      "Conversation Hooks", 
      "Hiring Status", 
      "Draft Message"
    ];

    // Try to split by common markers if ## is missing
    if (!normalizedMarkdown.includes("##") && !normalizedMarkdown.includes("###")) {
      let lastIndex = 0;
      
      // Create a regex that matches any of the known headers either as "**Header**" or "Header\n"
      const headerPatterns = knownHeaders.map(h => `(?:\\*\\*${h}\\*\\*|${h})`);
      
      for (let i = 0; i < knownHeaders.length; i++) {
        const header = knownHeaders[i];
        const nextHeader = knownHeaders[i+1];
        
        // Match the header name specifically
        const currentHeaderRegex = new RegExp(`(?:\\*\\*${header}\\*\\*|^${header}:?|\\n${header}:?)`, "im");
        
        const match = normalizedMarkdown.slice(lastIndex).match(currentHeaderRegex);
        
        if (match && match.index !== undefined) {
          const start = lastIndex + match.index;
          const searchAfterStart = normalizedMarkdown.slice(start + match[0].length);
          
          // Find the next header to determine the end of this section
          let end = normalizedMarkdown.length;
          if (nextHeader) {
            const nextHeaderRegex = new RegExp(`(?:\\*\\*${nextHeader}\\*\\*|^${nextHeader}:?|\\n${nextHeader}:?)`, "im");
            const nextMatch = searchAfterStart.match(nextHeaderRegex);
            if (nextMatch && nextMatch.index !== undefined) {
              end = start + match[0].length + nextMatch.index;
            }
          }
          
          const content = normalizedMarkdown.slice(start + match[0].length, end).trim()
            .replace(/^[\s\n\-\u2014:]+|[\s\n\-\u2014]+$/g, "");
            
          if (content || header === "Draft Message") {
            sections.push({
              title: header,
              content: content,
              isDraftMessage: header.toLowerCase().includes("draft message")
            });
          }
          lastIndex = start + match[0].length;
        }
      }
    }

    // If no sections found with text headers, or it has markdown markers, use the standard regex
    if (sections.length === 0) {
      // Handle both ### and ##
      const sectionRegex = /(?:###|##)\s*([^\n]+)\n([\s\S]*?)(?=(?:###|##)\s|$)/g;
      let match;
      
      while ((match = sectionRegex.exec(normalizedMarkdown)) !== null) {
        const title = match[1].trim();
        const content = match[2].trim();
        const isDraftMessage = title.toLowerCase().includes("draft message");
        sections.push({ title, content, isDraftMessage });
      }
    }
    
    // Final fallback: if still nothing, split by double newlines and try to find headers
    if (sections.length === 0 && normalizedMarkdown.trim()) {
      const parts = normalizedMarkdown.split(/\n\n+/);
      parts.forEach(part => {
        const lines = part.split("\n");
        const firstLine = lines[0].replace(/\*\*/g, "").replace(/:$/, "").trim();
        
        if (knownHeaders.some(h => firstLine.toLowerCase().includes(h.toLowerCase()))) {
          const title = knownHeaders.find(h => firstLine.toLowerCase().includes(h.toLowerCase())) || firstLine;
          sections.push({
            title: title,
            content: lines.slice(1).join("\n").trim(),
            isDraftMessage: title.toLowerCase().includes("draft message")
          });
        }
      });
    }

    // Absolute fallback
    if (sections.length === 0 && normalizedMarkdown.trim()) {
      sections.push({
        title: "Research Result",
        content: normalizedMarkdown.trim(),
        isDraftMessage: false
      });
    }
    
    return sections;
  };

  const extractDraftMessage = (markdown: string): string => {
    // Try bold header first
    const boldMatch = markdown.match(/(?:\*\*Draft Message\*\*|Draft Message:?)([\s\S]*)$/i);
    if (boldMatch) {
      return boldMatch[1].replace(/\*\*/g, "").trim();
    }

    const draftRegex = /(?:###|##)\s*Draft Message[\s\S]*?(?=(?:###|##)|$)/i;
    const match = markdown.match(draftRegex);
    if (match) {
      return match[0]
        .replace(/(?:###|##)\s*Draft Message\s*/i, "")
        .replace(/\*\*/g, "")
        .trim();
    }
    return "";
  };

  const copyDraftMessage = async () => {
    if (!researchResult) return;
    const draftMessage = extractDraftMessage(researchResult);
    if (!draftMessage) {
      toast({ title: "No draft message found", variant: "destructive" });
      return;
    }
    try {
      await navigator.clipboard.writeText(draftMessage);
      setCopied(true);
      toast({ title: "Draft message copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
  };

  const handleLogOutreach = async () => {
    if (!researchResult) return;
    const draftMessage = extractDraftMessage(researchResult);
    
    // Extract subject from draft message if present
    let finalSubject = `Outreach to ${personName} at ${company}`;
    let finalBody = draftMessage;

    if (draftMessage.toLowerCase().startsWith("subject:")) {
      const subjectMatch = draftMessage.match(/^subject:\s*([^\n]+)/i);
      if (subjectMatch) {
        finalSubject = subjectMatch[1].trim();
        finalBody = draftMessage.slice(subjectMatch[0].length).trim();
      }
    }

    // Store data for the composer/logger
    localStorage.setItem("composer-draft-message", finalBody);
    localStorage.setItem("composer-draft-subject", finalSubject);
    localStorage.setItem("composer-draft-name", personName);
    localStorage.setItem("composer-draft-company", company);
    localStorage.setItem("composer-draft-outreach-type", "email");
    
    // Try to find or create the contact before navigating
    try {
      // Check if contact exists using apiRequest
      const response = await apiRequest("GET", "/api/contacts");
      if (!response.ok) {
        throw new Error("Failed to fetch contacts");
      }
      const contacts = await response.json();
      
      // Match on both name AND company (case-insensitive) for accuracy
      const normalizedName = personName.toLowerCase().trim();
      const normalizedCompany = company.toLowerCase().trim();
      
      const existingContact = contacts.find((c: { name: string; company?: string }) => 
        c.name.toLowerCase().trim() === normalizedName && 
        c.company?.toLowerCase().trim() === normalizedCompany
      );
      
      if (existingContact) {
        // Contact exists, store the ID
        localStorage.setItem("composer-draft-contact-id", existingContact.id);
      } else {
        // Create the contact first
        const sections = parseResearchSections(researchResult);
        const snapshot = sections.find(s => s.title.includes("Prospect Snapshot"))?.content || "";
        
        const titleMatch = snapshot.match(/Title:\s*([^\n]+)/i);
        const headlineMatch = snapshot.match(/Headline:\s*([^\n]+)/i);
        const aboutMatch = snapshot.match(/About:\s*([^\n]+)/i);
        const locationMatch = snapshot.match(/Location:\s*([^\n]+)/i);
        const experienceMatch = sections.find(s => s.title.includes("Experience"))?.content || "";
        const educationMatch = snapshot.match(/Background:\s*([^\n]+)/i);
        
        const contactData = {
          name: personName,
          company: company,
          role: titleMatch?.[1]?.trim() || null,
          headline: headlineMatch?.[1]?.trim() || titleMatch?.[1]?.trim() || null,
          about: aboutMatch?.[1]?.trim() || null,
          location: locationMatch?.[1]?.trim() || null,
          experience: experienceMatch || null,
          education: educationMatch?.[1]?.trim() || null,
          tags: "research-import"
        };

        const createResponse = await apiRequest("POST", "/api/contacts", contactData);
        if (!createResponse.ok) {
          throw new Error("Failed to create contact");
        }
        const newContact = await createResponse.json();
        
        if (newContact.id) {
          localStorage.setItem("composer-draft-contact-id", newContact.id);
          queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
          toast({ 
            title: "Contact created", 
            description: `${personName} added to contacts` 
          });
        }
      }
    } catch (error) {
      console.error("Error finding/creating contact:", error);
      toast({ 
        title: "Note", 
        description: "Could not auto-select contact. Please select manually." 
      });
    }
    
    // Send message data to n8n drafting webhook
    try {
      await fetch("https://n8n.srv1096794.hstgr.cloud/webhook/drafting-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: personName,
          researchBrief: `Draft outreach message for ${personName} at ${company}. Subject: ${finalSubject}. Body context: ${finalBody.substring(0, 500)}`,
          requestId: `draft-${personName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
          forceRefresh: false
        })
      });
    } catch (webhookError) {
      console.error("Drafting webhook notification failed:", webhookError);
    }
    
    // Navigate to outreach log page with pre-filled form
    setLocation("/outreach-log?action=new");
    toast({ 
      title: "Opening Outreach Log", 
      description: "Review and edit your outreach message" 
    });
  };

  const handleDraftVariants = async () => {
    if (!researchResult) return;
    const draftMessage = extractDraftMessage(researchResult);
    
    // Extract subject from draft message if present
    let finalSubject = `Outreach to ${personName} at ${company}`;
    let finalBody = draftMessage;

    if (draftMessage.toLowerCase().startsWith("subject:")) {
      const subjectMatch = draftMessage.match(/^subject:\s*([^\n]+)/i);
      if (subjectMatch) {
        finalSubject = subjectMatch[1].trim();
        finalBody = draftMessage.slice(subjectMatch[0].length).trim();
      }
    }

    try {
      await fetch("https://n8n.srv1096794.hstgr.cloud/webhook/create-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personId: personName,
          researchBrief: `Draft outreach message for ${personName} at ${company}. Subject: ${finalSubject}. Body context: ${finalBody.substring(0, 500)}`,
          requestId: `variants-${personName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
          forceRefresh: false
        })
      });
      toast({ 
        title: "Variants Requested", 
        description: "Creating message variants via AI workflow" 
      });
    } catch (webhookError) {
      console.error("Create variants webhook failed:", webhookError);
      toast({ 
        title: "Request Sent", 
        description: "Variant creation request submitted" 
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Prospect Research</h1>
          <p className="text-muted-foreground">Get AI-powered research briefs on prospects before reaching out</p>
        </div>
        {(personName || company || researchResult) && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleClear}
            className="text-destructive hover:text-destructive"
            data-testid="button-clear-research"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Data
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Research a Prospect
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="personName" className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Person Name
                </Label>
                <Input
                  id="personName"
                  data-testid="input-person-name"
                  placeholder="e.g. John Smith"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  disabled={researchMutation.isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company" className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Company
                </Label>
                <Input
                  id="company"
                  data-testid="input-company"
                  placeholder="e.g. Acme Corp"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  disabled={researchMutation.isPending}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                data-testid="button-research"
                disabled={researchMutation.isPending || !personName.trim() || !company.trim()}
                className="w-full md:w-auto"
              >
                {researchMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Researching... (15-30 seconds)
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Research
                  </>
                )}
              </Button>
              
              {researchResult && !researchMutation.isPending && (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="button-add-contact-research"
                  disabled={addContactMutation.isPending}
                  onClick={() => addContactMutation.mutate()}
                  className="w-full md:w-auto border-primary/20 hover:bg-primary/5 text-primary"
                >
                  {addContactMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4 mr-2" />
                  )}
                  Add Contact
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {researchMutation.isPending && (
        <div className="flex items-center justify-center py-12 animate-in fade-in duration-500">
          <Card className="w-full max-w-md border-muted/50">
            <CardContent className="py-12 px-8">
              <div className="flex flex-col items-center justify-center gap-6">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                  <div className="relative w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <p className="text-lg font-semibold">
                    Researching {personName} at {company}...
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This typically takes 15-30 seconds
                  </p>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Gathering insights</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {researchResult && !researchMutation.isPending && (
        <div className="space-y-4 animate-in fade-in duration-500">
          <h2 className="text-xl font-semibold">Research Results</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {parseResearchSections(researchResult).map((section, index) => (
              <Card
                key={index}
                data-testid={`section-${section.title.toLowerCase().replace(/\s+/g, "-")}`}
                className={`${
                  section.isDraftMessage
                    ? "md:col-span-2 bg-primary/5 border-primary/20 shadow-md ring-1 ring-primary/10"
                    : "bg-muted/30 border-none shadow-none"
                } transition-all duration-300 hover:shadow-lg hover:shadow-primary/5`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className={`font-semibold ${section.isDraftMessage ? "text-xl text-primary" : "text-base text-foreground/80"}`}>
                      {section.title}
                    </CardTitle>
                    {section.isDraftMessage && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          data-testid="button-copy-draft"
                          onClick={copyDraftMessage}
                          className="h-8"
                        >
                          {copied ? (
                            <>
                              <Check className="w-3.5 h-3.5 mr-1.5" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 mr-1.5" />
                              Copy
                            </>
                          )}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          data-testid="button-log-outreach"
                          onClick={handleLogOutreach}
                          className="h-8"
                        >
                          <LogIn className="w-3.5 h-3.5 mr-1.5" />
                          Log Outreach
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid="button-draft-variants"
                          onClick={handleDraftVariants}
                          className="h-8"
                        >
                          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                          Draft Variants
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className={`prose prose-sm dark:prose-invert max-w-none ${
                    section.isDraftMessage ? "text-base leading-relaxed" : "text-muted-foreground"
                  }`}>
                    <ReactMarkdown
                      components={{
                        h3: ({ children }) => (
                          <h4 className="text-sm font-semibold mt-4 mb-2 text-foreground">{children}</h4>
                        ),
                        p: ({ children }) => (
                          <p className={`mb-3 leading-relaxed ${
                            section.isDraftMessage ? "text-base text-foreground" : "text-sm"
                          }`}>{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc pl-5 mb-4 space-y-1.5 marker:text-primary/50">{children}</ul>
                        ),
                        li: ({ children }) => (
                          <li className={`${section.isDraftMessage ? "text-base" : "text-sm"} text-foreground/90`}>{children}</li>
                        ),
                        strong: ({ children }) => (
                          <strong className="font-bold text-foreground">{children}</strong>
                        ),
                        hr: () => (
                          <hr className="my-4 border-t border-border/50" />
                        ),
                      }}
                    >
                      {section.content}
                    </ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
