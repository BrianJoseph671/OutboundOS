import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Plus } from "lucide-react";
import { useLocation } from "wouter";
import { ImportModal } from "@/components/import-modal";

export default function ResearchSetup() {
  const [, setLocation] = useLocation();
  const [showImportModal, setShowImportModal] = useState(false);

  const handleImportSuccess = () => {
    setShowImportModal(false);
    setLocation("/contacts");
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-research-setup-title">
          Who do you want to research?
        </h1>
        <p className="text-muted-foreground text-lg" data-testid="text-research-setup-subtitle">
          Import your prospect list or start adding contacts manually
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="hover-elevate cursor-pointer" onClick={() => setShowImportModal(true)}>
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="w-8 h-8 text-primary" />
            </div>
            <CardTitle data-testid="text-import-spreadsheet-heading">Import from spreadsheet</CardTitle>
            <CardDescription>
              Upload an Excel file or connect your Airtable base
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-4">
            <Button 
              data-testid="button-import-contacts"
              onClick={(e) => {
                e.stopPropagation();
                setShowImportModal(true);
              }}
            >
              Import contacts
            </Button>
          </CardContent>
        </Card>

        <Card className="hover-elevate cursor-pointer" onClick={() => setLocation("/prospect-research")}>
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
              <Plus className="w-8 h-8 text-accent-foreground" />
            </div>
            <CardTitle data-testid="text-add-manually-heading">Add contacts manually</CardTitle>
            <CardDescription>
              Build your prospect list one contact at a time
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pt-4">
            <Button 
              variant="outline"
              data-testid="button-add-first-contact"
              onClick={(e) => {
                e.stopPropagation();
                setLocation("/prospect-research");
              }}
            >
              Add first contact
            </Button>
          </CardContent>
        </Card>
      </div>

      <ImportModal 
        open={showImportModal} 
        onOpenChange={setShowImportModal}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
}
