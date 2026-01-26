import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Copy, Check, User, Building2, Trash2, Sparkles, LogIn, ExternalLink } from "lucide-react";
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
    
    // First, try to handle the specific format seen in logs which might use bold headers instead of ##
    if (!markdown.includes("##")) {
      const boldHeaders = ["Prospect Snapshot", "Company Snapshot", "Connection Angles", "Conversation Hooks", "Hiring Status", "Draft Message"];
      let lastIndex = 0;
      
      for (let i = 0; i < boldHeaders.length; i++) {
        const header = boldHeaders[i];
        const nextHeader = boldHeaders[i+1];
        
        const currentHeaderRegex = new RegExp(`\\*\\*${header}\\*\\*`, "i");
        const nextHeaderRegex = nextHeader ? new RegExp(`\\*\\*${nextHeader}\\*\\*`, "i") : /$/;
        
        const startMatch = markdown.slice(lastIndex).match(currentHeaderRegex);
        if (startMatch && startMatch.index !== undefined) {
          const start = lastIndex + startMatch.index;
          const searchAfterStart = markdown.slice(start + startMatch[0].length);
          const endMatch = searchAfterStart.match(nextHeaderRegex);
          
          const end = endMatch && endMatch.index !== undefined 
            ? start + startMatch[0].length + endMatch.index
            : markdown.length;
            
          const content = markdown.slice(start + startMatch[0].length, end).trim().replace(/^[\s\n\-\u2014]+|[\s\n\-\u2014]+$/g, "");
          if (content) {
            sections.push({
              title: header,
              content: content,
              isDraftMessage: header.toLowerCase().includes("draft message")
            });
          }
          lastIndex = start + startMatch[0].length;
        }
      }
    }

    // If no sections found with bold headers, or it has ## markers, use the standard regex
    if (sections.length === 0) {
      const sectionRegex = /##\s*([^\n]+)\n([\s\S]*?)(?=##\s|$)/g;
      let match;
      
      while ((match = sectionRegex.exec(markdown)) !== null) {
        const title = match[1].trim();
        const content = match[2].trim();
        const isDraftMessage = title.toLowerCase().includes("draft message");
        sections.push({ title, content, isDraftMessage });
      }
    }
    
    // Final fallback: if still nothing, just show the whole thing as "Research Result"
    if (sections.length === 0 && markdown.trim()) {
      sections.push({
        title: "Research Result",
        content: markdown.trim(),
        isDraftMessage: false
      });
    }
    
    return sections;
  };

  const extractDraftMessage = (markdown: string): string => {
    // Try bold header first
    const boldMatch = markdown.match(/\*\*Draft Message\*\*([\s\S]*)$/i);
    if (boldMatch) {
      return boldMatch[1].replace(/\*\*/g, "").trim();
    }

    const draftRegex = /##\s*Draft Message[\s\S]*?(?=##|$)/i;
    const match = markdown.match(draftRegex);
    if (match) {
      return match[0]
        .replace(/##\s*Draft Message\s*/i, "")
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

  const handleLogOutreach = () => {
    if (!researchResult) return;
    const draftMessage = extractDraftMessage(researchResult);
    
    // Store data for the composer/logger
    localStorage.setItem("composer-draft-message", draftMessage);
    localStorage.setItem("composer-draft-name", personName);
    localStorage.setItem("composer-draft-company", company);
    
    // Navigate to outreach log to record the attempt
    setLocation("/outreach-log?action=new");
    toast({ 
      title: "Opening Outreach Log", 
      description: "Record your outreach attempt for " + personName 
    });
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
          
          {parseResearchSections(researchResult).map((section, index) => (
            <div
              key={index}
              data-testid={`section-${section.title.toLowerCase().replace(/\s+/g, "-")}`}
              className={`rounded-lg p-5 ${
                section.isDraftMessage
                  ? "bg-primary/5 border border-primary/20"
                  : "bg-muted/30"
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <h3 className={`font-semibold ${section.isDraftMessage ? "text-lg" : "text-base"}`}>
                  {section.title}
                </h3>
                {section.isDraftMessage && (
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      data-testid="button-copy-draft"
                      onClick={copyDraftMessage}
                      className="w-full sm:w-auto"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Message
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      data-testid="button-log-outreach"
                      onClick={handleLogOutreach}
                      className="w-full sm:w-auto border-primary/30 hover:bg-primary/5"
                    >
                      <LogIn className="w-4 h-4 mr-2" />
                      Log Outreach
                    </Button>
                  </div>
                )}
              </div>
              
              <div className={`prose prose-sm dark:prose-invert max-w-none ${
                section.isDraftMessage ? "text-base leading-relaxed" : ""
              }`}>
                <ReactMarkdown
                  components={{
                    h3: ({ children }) => (
                      <h4 className="text-sm font-medium mt-3 mb-2">{children}</h4>
                    ),
                    p: ({ children }) => (
                      <p className={`text-foreground mb-3 leading-relaxed ${
                        section.isDraftMessage ? "text-base" : "text-sm"
                      }`}>{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
                    ),
                    li: ({ children }) => (
                      <li className="text-sm text-foreground">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-foreground">{children}</strong>
                    ),
                  }}
                >
                  {section.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
