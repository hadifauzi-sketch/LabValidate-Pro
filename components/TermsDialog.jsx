import { FileText, X, Check, Database, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/* Bump this when the terms change — the app re-prompts users to re-accept. */
export const TERMS_VERSION = "1.0";
export const TERMS_UPDATED = "26 July 2026";

/**
 * Terms & Conditions.
 *  • mandatory  → full-screen acceptance gate; calls onAgree() when accepted.
 *  • otherwise  → a dismissible read-only view (opened from "About this app").
 */
export function TermsDialog({ open, onClose, onAgree, mandatory = false }) {
  if (!open) return null;

  return (
    <div
      className="lvp-no-print fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto p-4 sm:p-6"
      onClick={mandatory ? undefined : onClose}
    >
      {mandatory ? (
        <div className="absolute inset-0 bg-background">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      )}

      <div
        className="relative my-auto w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">Terms &amp; Privacy Policy</div>
          </div>
          {!mandatory && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Scrollable body */}
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4 text-[13px] leading-relaxed text-muted-foreground">
          <p className="text-[12px] font-data">
            Version {TERMS_VERSION} · Last updated {TERMS_UPDATED}
          </p>

          <p>
            Please read these Terms &amp; Conditions (“Terms”) carefully before using LabValidate Pro
            (the “App”). By accessing or using the App you agree to be bound by these Terms. If you do
            not agree, you must not use the App.
          </p>

          {/* Highlighted data clause — the important part for users */}
          <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
              <Database className="h-3.5 w-3.5 text-primary" /> Your data &amp; the cloud database
            </div>
            <p className="text-[12.5px]">
              This App collects and stores some of the information you enter (your account details and
              the validation studies you save) in a cloud SQL database so that your work is saved and
              synced across your devices. This stored data is accessible only to the developer for the
              purpose of operating and maintaining the App. It is <b>not</b> extracted, sold, shared, or
              made available to any third party for their own use.
            </p>
          </div>

          <Section n="1" title="Acceptance of terms">
            By creating an account or otherwise using the App, you confirm that you have read,
            understood, and agree to these Terms and to the way your data is handled as described above.
          </Section>

          <Section n="2" title="Use of the App">
            The App is provided to help analytical laboratories plan, record, and evaluate method
            validation and verification studies. You agree to use it only for lawful purposes and not to
            misuse, disrupt, reverse-engineer, or attempt to gain unauthorised access to the App or its
            data.
          </Section>

          <Section n="3" title="Your account & content">
            You are responsible for keeping your login credentials secure and for the accuracy of the
            data you enter. You retain ownership of the study content you create. You are responsible for
            keeping your own backups of any data that is important to you.
          </Section>

          <Section n="4" title="Data, privacy & security">
            The information described above is stored in a secured cloud SQL database. While reasonable
            measures are taken to protect it, no method of electronic storage or transmission is
            completely secure, and absolute security cannot be guaranteed. Do not enter data you are not
            permitted to store in a third-party cloud service.
          </Section>

          <Section n="5" title="Beta software">
            The App is provided on a beta basis and may change, contain errors, or be unavailable at
            times. Calculations and pass/fail checks are provided as an aid and must be independently
            verified by a competent person before being relied upon for any regulatory, accreditation, or
            reporting purpose.
          </Section>

          <Section n="6" title="No warranty">
            The App is provided “as is” and “as available”, without warranties of any kind, whether
            express or implied, including fitness for a particular purpose and accuracy of results.
          </Section>

          <Section n="7" title="Limitation of liability">
            To the fullest extent permitted by law, the developer shall not be liable for any indirect,
            incidental, or consequential loss, or for any loss of data, profits, or business, arising
            from your use of or inability to use the App.
          </Section>

          <Section n="8" title="Changes to these terms">
            These Terms may be updated from time to time. When they change, you may be asked to review
            and accept the updated Terms before continuing to use the App.
          </Section>

          <Section n="9" title="Contact">
            For any questions about these Terms or your data, please contact the developer.
          </Section>

          {/* ── Privacy Policy ─────────────────────────────────────── */}
          <div className="flex items-center gap-2 border-t border-border pt-4">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-[13px] font-semibold text-foreground">Privacy Policy</h2>
          </div>

          <Section n="P1" title="What we collect">
            We collect the account details you provide when you register (such as your name and email
            address) and the validation-study content you choose to save. We may also store basic
            technical information needed to run the service.
          </Section>

          <Section n="P2" title="Why we collect it">
            Your information is used only to operate the App: to sign you in, to save your studies, and
            to sync your work across your devices. It is not used for advertising or profiling.
          </Section>

          <Section n="P3" title="Where it is stored & who can access it">
            Your data is stored in a secured cloud SQL database. Access is limited to the developer for
            the sole purpose of operating and maintaining the App. Your data is <b>not</b> sold, rented,
            shared, or extracted for use by any third party.
          </Section>

          <Section n="P4" title="Retention">
            Your data is kept for as long as your account is active. You may request deletion of your
            account and associated data, after which it will be removed from the active database.
          </Section>

          <Section n="P5" title="Local storage & cookies">
            The App stores small items in your browser (for example your session and your acceptance of
            these Terms) so it can keep you signed in and remember your preferences. No third-party
            advertising or tracking cookies are used.
          </Section>

          <Section n="P6" title="Your choices">
            You can edit your account details, export your studies, or delete your account at any time
            from within the App. If you do not agree with how your data is handled, please stop using the
            App.
          </Section>
        </div>

        {/* Footer */}
        {mandatory ? (
          <div className="space-y-3 border-t border-border px-5 py-4">
            <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>You must agree to the Terms &amp; Conditions and Privacy Policy to use LabValidate Pro.</span>
            </div>
            <Button className="w-full" onClick={onAgree}>
              <Check className="mr-2 h-4 w-4" /> I have read and agree to the Terms &amp; Privacy Policy
            </Button>
          </div>
        ) : (
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ n, title, children }) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-foreground">{n}. {title}</h3>
      <p className="mt-0.5">{children}</p>
    </div>
  );
}
