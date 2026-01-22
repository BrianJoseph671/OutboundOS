import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  Download,
  User,
  Briefcase,
  Trash2,
  RefreshCw,
} from "lucide-react";
import type { Settings as SettingsType } from "@shared/schema";
import { format } from "date-fns";
import { getStoredProfile, clearStoredProfile, type UserProfile } from "@/components/profile-setup";

export default function Settings() {
  const { toast } = useToast();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => getStoredProfile());

  const { data: settings, isLoading } = useQuery<SettingsType>({
    queryKey: ["/api/settings"],
  });

  const [formData, setFormData] = useState<Partial<SettingsType>>({
    defaultTone: "professional",
    defaultCtaOptions: "15 min chat\nQuick question\nReferral request",
    emailSignature: "",
    emailSubjectPatterns: "Quick question about {company}\n{name} x networking",
    includeProofLine: true,
    includeLogisticsLine: true,
    connectionRequestCharLimit: 300,
  });

  useEffect(() => {
    if (settings) {
      setFormData(settings);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<SettingsType>) =>
      settings?.id
        ? apiRequest("PATCH", `/api/settings/${settings.id}`, data)
        : apiRequest("POST", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleReset = () => {
    setFormData({
      defaultTone: "professional",
      defaultCtaOptions: "15 min chat\nQuick question\nReferral request",
      emailSignature: "",
      emailSubjectPatterns: "Quick question about {company}\n{name} x networking",
      includeProofLine: true,
      includeLogisticsLine: true,
      connectionRequestCharLimit: 300,
    });
    toast({ title: "Settings reset to defaults" });
  };

  const handleExportContacts = async () => {
    try {
      const response = await fetch("/api/export/contacts");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contacts-${format(new Date(), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "Contacts exported" });
    } catch {
      toast({ title: "Failed to export contacts", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <div className="grid gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="animate-pulse space-y-4">
                  <div className="h-5 bg-muted rounded w-1/4" />
                  <div className="h-10 bg-muted rounded w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleReset} data-testid="button-reset-settings">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-save-settings">
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Message Defaults</CardTitle>
          <CardDescription>
            Configure default settings for the message composer
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="defaultTone">Default Tone</Label>
            <Select
              value={formData.defaultTone || "professional"}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, defaultTone: v }))}
            >
              <SelectTrigger data-testid="select-settings-tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="direct">Direct</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultCtaOptions">Default CTA Options (one per line)</Label>
            <Textarea
              id="defaultCtaOptions"
              value={formData.defaultCtaOptions || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, defaultCtaOptions: e.target.value }))}
              placeholder="15 min chat&#10;Quick question&#10;Referral request"
              rows={4}
              data-testid="input-settings-cta"
            />
            <p className="text-xs text-muted-foreground">
              These will appear as quick-select options in the composer
            </p>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="includeProofLine">Include Credibility/Proof Line</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Add proof point section to generated messages
              </p>
            </div>
            <Switch
              id="includeProofLine"
              checked={formData.includeProofLine ?? true}
              onCheckedChange={(v) => setFormData((prev) => ({ ...prev, includeProofLine: v }))}
              data-testid="switch-settings-proof"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="includeLogisticsLine">Include Logistics Line</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Add availability/timeframe to generated messages
              </p>
            </div>
            <Switch
              id="includeLogisticsLine"
              checked={formData.includeLogisticsLine ?? true}
              onCheckedChange={(v) => setFormData((prev) => ({ ...prev, includeLogisticsLine: v }))}
              data-testid="switch-settings-logistics"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">LinkedIn Settings</CardTitle>
          <CardDescription>
            Configure settings specific to LinkedIn outreach
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="connectionRequestCharLimit">Connection Request Character Limit</Label>
            <Input
              id="connectionRequestCharLimit"
              type="number"
              min={100}
              max={300}
              value={formData.connectionRequestCharLimit || 300}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  connectionRequestCharLimit: parseInt(e.target.value) || 300,
                }))
              }
              data-testid="input-settings-char-limit"
            />
            <p className="text-xs text-muted-foreground">
              LinkedIn limits connection request notes to 300 characters
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Email Settings</CardTitle>
          <CardDescription>
            Configure email-specific message settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="emailSubjectPatterns">Subject Line Patterns (one per line)</Label>
            <Textarea
              id="emailSubjectPatterns"
              value={formData.emailSubjectPatterns || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, emailSubjectPatterns: e.target.value }))}
              placeholder="Quick question about {company}&#10;{name} x {your_name}"
              rows={3}
              data-testid="input-settings-subject"
            />
            <p className="text-xs text-muted-foreground">
              Use {"{company}"}, {"{name}"}, {"{role}"} as placeholders
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="emailSignature">Email Signature</Label>
            <Textarea
              id="emailSignature"
              value={formData.emailSignature || ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, emailSignature: e.target.value }))}
              placeholder="Best,&#10;Your Name&#10;Your Title"
              rows={4}
              data-testid="input-settings-signature"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Data Export</CardTitle>
          <CardDescription>
            Export your data for backup or analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Export Contacts</p>
              <p className="text-sm text-muted-foreground">
                Download all contacts as a CSV file
              </p>
            </div>
            <Button variant="outline" onClick={handleExportContacts} data-testid="button-export-contacts">
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="w-5 h-5" />
            Your Profile
          </CardTitle>
          <CardDescription>
            Your profile information used for personalizing outreach
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {userProfile ? (
            <>
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{userProfile.name}</span>
                </div>
                {userProfile.currentRole && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">
                      {userProfile.currentRole}
                      {userProfile.company && ` at ${userProfile.company}`}
                    </span>
                  </div>
                )}
                {userProfile.skills && userProfile.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {userProfile.skills.slice(0, 5).map((skill, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{skill}</Badge>
                    ))}
                    {userProfile.skills.length > 5 && (
                      <Badge variant="outline" className="text-xs">+{userProfile.skills.length - 5} more</Badge>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearStoredProfile();
                    setUserProfile(null);
                    toast({ title: "Profile cleared - refresh to set up again" });
                  }}
                  className="text-destructive hover:text-destructive"
                  data-testid="button-clear-profile"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Profile
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearStoredProfile();
                    window.location.reload();
                  }}
                  data-testid="button-redo-profile"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Redo Profile Setup
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-muted-foreground mb-3">No profile set up yet</p>
              <Button
                onClick={() => window.location.reload()}
                data-testid="button-setup-profile-settings"
              >
                Set Up Profile
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
