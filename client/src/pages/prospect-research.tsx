import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Search, Loader2, Copy, Check, User, Building2, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

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

  const extractDraftMessage = (markdown: string): string => {
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
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-primary" />
              <div className="text-center">
                <p className="font-medium">Researching {personName} at {company}...</p>
                <p className="text-sm text-muted-foreground">This typically takes 15-30 seconds</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {researchResult && !researchMutation.isPending && (
        <Card>
          <CardHeader>
            <CardTitle>Research Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  h2: ({ children }) => {
                    const isDraftMessage = String(children).toLowerCase().includes("draft message");
                    return (
                      <div className="flex items-center justify-between gap-4 mt-6 mb-3 pb-2 border-b first:mt-0">
                        <h2 className="text-lg font-semibold m-0">
                          {children}
                        </h2>
                        {isDraftMessage && (
                          <Button
                            variant="outline"
                            size="sm"
                            data-testid="button-copy-draft-inline"
                            onClick={copyDraftMessage}
                            className="h-8"
                          >
                            {copied ? (
                              <>
                                <Check className="w-3 h-3 mr-2" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 mr-2" />
                                Copy
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    );
                  },
                  h3: ({ children }) => (
                    <h3 className="text-base font-medium mt-4 mb-2">{children}</h3>
                  ),
                  p: ({ children }) => (
                    <p className="text-sm text-foreground mb-3 leading-relaxed">{children}</p>
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
                {researchResult}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
