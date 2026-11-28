import { createFileRoute, Link } from "@tanstack/react-router";
import { breadcrumbLd, canonicalLink, jsonLd } from "@/lib/seo";
import { ArrowUpRight, Mail, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { OnyxMark } from "@/components/landing/OnyxMark";

const PRIVACY_EMAIL = "workonyx.support@gmail.com";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — ONYX" },
      { name: "description", content: "Learn how ONYX handles account, academic, uploaded-file and AI-feature information." },
      { property: "og:title", content: "Privacy Policy — ONYX" },
      { property: "og:description", content: "How ONYX collects, uses, shares and protects personal information." },
      { property: "og:type", content: "website" },
    ],
    links: [canonicalLink("/privacy-policy")],
    scripts: [
      jsonLd(
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Privacy Policy", path: "/privacy-policy" },
        ]),
      ),
    ],
  }),
  component: PrivacyPolicyPage,
});

function PolicySection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-b border-border/60 py-8 last:border-0">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

const CONTENTS = [
  ["operator", "Who operates ONYX"],
  ["information", "Information we handle"],
  ["use", "How we use information"],
  ["ai", "AI-powered features"],
  ["sharing", "When information is shared"],
  ["storage", "Storage & profile photos"],
  ["browser", "Browser storage"],
  ["children", "Children & institutions"],
  ["choices", "Your choices & requests"],
  ["security", "Security & providers"],
  ["changes", "Policy changes"],
  ["contact", "Contact us"],
];

function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/" aria-label="ONYX home" className="flex items-center gap-2">
            <OnyxMark className="h-7 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Home</Link>
            <Link to="/auth" className="rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">Sign in</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-primary">
            <ShieldCheck className="size-4" /> Privacy &amp; data
          </div>
          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-5xl">Privacy Policy</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                This notice explains what information ONYX handles, why it is used, when it may be shared,
                and how you can contact us about your information.
              </p>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">Effective: 24 November 2026</p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operator</p>
              <p className="mt-2 text-sm font-semibold text-foreground">Mohammed Amin Akbar Patwekar</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Privacy contact</p>
              <a href="mailto:workonyx.support@gmail.com" className="mt-2 inline-flex break-all text-sm font-semibold text-primary hover:underline">{PRIVACY_EMAIL}</a>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Platform</p>
              <p className="mt-2 text-sm font-semibold text-foreground">ONYX — Online Network for Yielding Xcellence</p>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[205px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">On this page</p>
              <nav className="flex flex-wrap gap-2 lg:flex-col lg:gap-1" aria-label="Privacy policy sections">
                {CONTENTS.map(([id, label]) => (
                  <a key={id} href={"#" + id} className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    {label}
                  </a>
                ))}
              </nav>
            </aside>

            <article className="min-w-0 rounded-2xl border border-border/70 bg-card px-5 sm:px-8">
              <div className="border-b border-border/60 py-6">
                <p className="text-sm leading-7 text-foreground">
                  ONYX is an educational platform for schools, colleges, teachers and students. It supports
                  classes, assignments, handwritten or digital submissions, quizzes, grading, attendance,
                  announcements and related learning workflows. Those activities require ONYX to handle
                  account details and educational records.
                </p>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  Please read this policy together with any privacy notice or instructions provided by your
                  school, college or other institution. An institution may have its own responsibilities
                  and rules for the educational records it manages.
                </p>
              </div>

              <PolicySection id="operator" title="1. Who operates ONYX">
                <p>
                  ONYX (Online Network for Yielding Xcellence) is operated by
                  <strong className="font-semibold text-foreground"> Mohammed Amin Akbar Patwekar</strong>.
                  The operator is the contact for privacy questions and requests relating to ONYX.
                  You can reach the privacy contact at{" "}
                  <a className="font-medium text-primary hover:underline" href="mailto:workonyx.support@gmail.com">{PRIVACY_EMAIL}</a>.
                </p>
                <p>
                  When an institution arranges or directs the use of ONYX, that institution may determine
                  which students and staff use the service, which classes are created, and which academic
                  records are required for its educational activities.
                </p>
              </PolicySection>

              <PolicySection id="information" title="2. Information we handle">
                <p>Depending on how you and your institution use ONYX, information may include:</p>
                <ul className="list-disc space-y-2 pl-5 marker:text-primary">
                  <li><strong className="font-semibold text-foreground">Account and sign-in details:</strong>{" "}name, email address, account identifier and sign-in or authentication information. If you choose Google sign-in, Google also handles the authentication step.</li>
                  <li><strong className="font-semibold text-foreground">Profile and institution details:</strong>{" "}profile photo, assigned role (such as student, teacher or administrator), institution, department and profile information you provide.</li>
                  <li><strong className="font-semibold text-foreground">Class and roster information:</strong>{" "}class membership, class codes, roll number, ER number, SR number and other roster details entered by you or an authorized institution user.</li>
                  <li><strong className="font-semibold text-foreground">Academic records:</strong>{" "}assignments, uploaded submissions, resources, quiz questions and attempts, answers, marks, grades, comments, rubric results, attendance, announcements, progress information and achievements.</li>
                  <li><strong className="font-semibold text-foreground">Content you submit:</strong>{" "}text, documents, PDFs, presentations, spreadsheets, images and other material you upload or create through ONYX.</li>
                  <li><strong className="font-semibold text-foreground">Preferences and communications:</strong>{" "}notification settings, service emails, support messages and information needed to respond to your requests.</li>
                  <li><strong className="font-semibold text-foreground">Technical and security information:</strong>{" "}session information, basic browser or device information and error or security records generated when the service is used.</li>
                </ul>
                <p>Please do not upload sensitive personal information unless it is genuinely needed for the educational task and you are authorized to provide it.</p>
              </PolicySection>

              <PolicySection id="use" title="3. How we use information">
                <p>ONYX uses information to:</p>
                <ul className="list-disc space-y-2 pl-5 marker:text-primary">
                  <li>create and secure accounts and authenticate users;</li>
                  <li>provide classes, class rosters, assignments, submissions and resources;</li>
                  <li>support quizzes, grading, feedback, rubrics, attendance and progress tools;</li>
                  <li>show information to the teachers and institution staff authorized to manage it;</li>
                  <li>send account, submission, grade-release and other supported service notifications;</li>
                  <li>operate, troubleshoot, maintain and protect ONYX against misuse or security incidents;</li>
                  <li>respond to support, privacy and legal requests; and</li>
                  <li>meet applicable legal obligations and protect the rights and safety of users.</li>
                </ul>
                <p>
                  ONYX does not sell personal information. Educational records such as submissions,
                  grades and attendance are used to provide and manage the educational service, not for
                  targeted advertising.
                </p>
              </PolicySection>

              <PolicySection id="ai" title="4. AI-powered features">
                <p>
                  If you choose an AI feature, the information needed for that feature may be sent from
                  ONYX to Google's Gemini API so it can generate a result. For example, quiz generation
                  can send the study text and files you attach (including supported PDFs and images).
                  AI rubric generation can send the assignment description entered by a teacher.
                </p>
                <p>
                  The AI provider processes that information to return the requested output and may
                  handle it under its own terms and privacy practices. ONYX does not control Google's
                  independent service policies. Do not include student names, contact details or other
                  personal information in AI prompts or attachments unless it is necessary and you are
                  authorized to do so.
                </p>
                <p>
                  AI-generated results can be incomplete or inaccurate. Teachers and other responsible
                  users should review generated questions, rubrics and other outputs before relying on them.
                </p>
              </PolicySection>

              <PolicySection id="sharing" title="5. When information is shared">
                <p>Information may be available to or processed by the following recipients:</p>
                <ul className="list-disc space-y-2 pl-5 marker:text-primary">
                  <li><strong className="font-semibold text-foreground">Teachers and class staff:</strong>{" "}teachers and authorized co-teachers may access the class information, submissions, answers, grades and activity needed to manage and assess their classes.</li>
                  <li><strong className="font-semibold text-foreground">Institution administrators:</strong>{" "}authorized institution administrators may access institution-scoped directories, class and academic information available to their role.</li>
                  <li><strong className="font-semibold text-foreground">Other class members:</strong>{" "}some class details, such as roster names or class information, may be visible to members where the relevant ONYX feature allows it.</li>
                  <li><strong className="font-semibold text-foreground">Platform operator and support:</strong>{" "}the operator may access information when reasonably needed to maintain the platform, investigate a reported issue, provide support or protect the service.</li>
                  <li><strong className="font-semibold text-foreground">Service providers:</strong>{" "}cloud hosting, database, authentication, file storage, AI and email providers process information to provide their services to ONYX.</li>
                  <li><strong className="font-semibold text-foreground">Legal and safety reasons:</strong>{" "}information may be disclosed when required by law or valid legal process, or when reasonably necessary to protect users, the public or the service.</li>
                </ul>
                <p>
                  Access is intended to follow the user's role, institution and class permissions. An
                  institution may also have its own rules about how teachers and administrators use
                  academic records.
                </p>
              </PolicySection>

              <PolicySection id="storage" title="6. Storage, profile photos and retention">
                <p>
                  ONYX uses Lovable Cloud services for application hosting and its cloud-backed
                  authentication, database and file storage. Access to educational files is controlled
                  by the permissions configured for the relevant feature and user role.
                </p>
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-foreground">
                  <p className="font-semibold">Important: profile photos are publicly readable</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    The current profile-avatar storage bucket is configured as public. A profile photo
                    uploaded to ONYX can therefore be viewed by anyone who has its image URL, even if
                    that person is not signed in. Do not upload a photo you are not comfortable making
                    publicly accessible. Contact us at{" "}
                    <a className="font-medium text-primary hover:underline" href="mailto:workonyx.support@gmail.com">{PRIVACY_EMAIL}</a>
                    {" "}to request removal of a profile photo.
                  </p>
                </div>
                <p>
                  We keep information for as long as it is needed to provide ONYX, support an
                  institution's educational activities, maintain security and records, resolve disputes,
                  or meet legal obligations. The period can depend on the type of information and the
                  institution's requirements. We do not currently publish one fixed deletion period for
                  every data category.
                </p>
                <p>
                  When an account or institution relationship ends, some academic or transaction records
                  may remain where they are still needed by the institution or must be retained for legal,
                  security or operational reasons. You can send a deletion request using the contact
                  details below; requests involving institution-managed records may need to be coordinated
                  with that institution.
                </p>
              </PolicySection>

              <PolicySection id="browser" title="7. Cookies and browser storage">
                <p>
                  ONYX uses browser storage and session technologies to keep users signed in, remember
                  session confirmation, preserve an institution join link during the sign-in flow, and
                  remember appearance choices such as theme and accent settings. The application may
                  also register a service worker on the live site for app installation and offline support.
                </p>
                <p>
                  These technologies support the operation and usability of ONYX. You can manage browser
                  storage through your browser settings, but clearing it may sign you out or reset saved
                  preferences.
                </p>
              </PolicySection>

              <PolicySection id="children" title="8. Children and institution-managed use">
                <p>
                  ONYX may be used in school and college settings where some students are under 18.
                  If you are under 18, use ONYX through an authorized school or college, or with the
                  parent or guardian involvement required by applicable law and the relevant
                  institution's rules.
                </p>
                <p>
                  Schools, colleges and other institutions should ensure that any required permissions,
                  notices or consents are in place before they provide student information or invite
                  students to use ONYX. If you are a parent or guardian and believe a child's information
                  has been provided without the required authority, contact us using the email below.
                </p>
              </PolicySection>

              <PolicySection id="choices" title="9. Your choices and privacy requests">
                <p>You can:</p>
                <ul className="list-disc space-y-2 pl-5 marker:text-primary">
                  <li>review and update profile details that are editable in Settings;</li>
                  <li>change supported notification preferences in Settings;</li>
                  <li>ask us to provide information about personal information associated with your account;</li>
                  <li>request correction or deletion, or raise an objection or grievance where a right is available under applicable law; and</li>
                  <li>withdraw consent where processing is based on your consent and applicable law provides that option.</li>
                </ul>
                <p>
                  Email <a className="font-medium text-primary hover:underline" href="mailto:workonyx.support@gmail.com">{PRIVACY_EMAIL}</a>
                  {" "}with the subject “Privacy Request”. Tell us which account or institution is
                  involved and what you are requesting. Please do not send passwords or authentication
                  codes. We may ask for reasonable information to verify your identity and authority
                  before acting. Some requests may need to be handled with your school or college, and
                  some records may need to be retained where the law permits or requires it.
                </p>
              </PolicySection>

              <PolicySection id="security" title="10. Security and service providers">
                <p>
                  ONYX uses role-based permissions, authenticated access and service-provider security
                  features intended to protect information. Some files are stored in private storage
                  locations with access controlled by the application. As explained above, profile
                  photos are currently stored in a public bucket.
                </p>
                <p>
                  No website, network or storage system can be guaranteed to be completely secure. Keep
                  your password and sign-in codes private, sign out on shared devices, and contact us
                  promptly if you suspect unauthorized access to your account.
                </p>
                <p>
                  Our current service integrations include Lovable Cloud for hosting and cloud-backed
                  platform services, Google for Gemini AI features and optional Google sign-in, and
                  Lovable's managed email service for supported transactional notifications. The
                  codebase also contains a Razorpay checkout labelled for test-mode verification only:
                  it is not currently used by ONYX to activate or manage live subscriptions. If you use
                  a test checkout, Razorpay may process checkout information in its test environment
                  under its own terms.
                </p>
                <p>
                  These providers process information under their own service terms and privacy
                  practices. Depending on provider infrastructure and configuration, information may
                  be processed in locations outside your state or country.
                </p>
              </PolicySection>

              <PolicySection id="changes" title="11. Changes to this policy">
                <p>
                  We may update this policy when ONYX features, providers or applicable legal requirements
                  change. The latest version will be published on this page with its updated effective
                  date. For material changes, we may also provide a notice through ONYX or another
                  appropriate channel.
                </p>
              </PolicySection>

              <PolicySection id="contact" title="12. Contact and privacy complaints">
                <p>
                  For questions, access or correction requests, deletion requests, or privacy complaints,
                  contact the ONYX operator:
                </p>
                <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                  <p className="font-semibold text-foreground">Mohammed Amin Akbar Patwekar</p>
                  <p className="text-sm">Operator — ONYX</p>
                  <a href="mailto:workonyx.support@gmail.com" className="mt-3 inline-flex items-center gap-2 break-all font-medium text-primary hover:underline">
                    <Mail className="size-4 shrink-0" /> {PRIVACY_EMAIL} <ArrowUpRight className="size-3.5 shrink-0" />
                  </a>
                </div>
                <p>
                  We will review and respond to requests in accordance with applicable law and the
                  information available to verify the request.
                </p>
              </PolicySection>

              <p className="border-t border-border/60 py-6 text-xs leading-6 text-muted-foreground">
                This policy describes ONYX's current product practices as of 24 November 2026. It is not
                a substitute for advice from a qualified legal professional. Institutions may have
                additional privacy obligations for records they control.
              </p>
            </article>
          </div>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>ONYX — Online Network for Yielding Xcellence.</span>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <a href="mailto:workonyx.support@gmail.com" className="hover:text-foreground">Privacy contact</a>
            <span>© 2026 ONYX</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
