import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { ROLES } from '../constants/roles';
import { SCHOOL_INFO } from '../constants/schoolInfo';
import { motion, useInView, AnimatePresence } from 'framer-motion';

// Floating shape animations
const FloatingShape = ({ className, delay }: { className: string; delay: number }) => (
  <motion.div
    className={`absolute rounded-full blur-3xl ${className}`}
    animate={{
      y: [0, 40, 0],
      x: [0, 20, 0],
      opacity: [0.3, 0.5, 0.3],
    }}
    transition={{
      duration: 8,
      repeat: Infinity,
      delay,
      ease: "easeInOut",
    }}
  />
);

// Counter component with scroll trigger
const AnimatedCounter = ({ target, suffix = "" }: { target: number; suffix?: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  useEffect(() => {
    if (isInView) {
      let start = 0;
      const duration = 2000;
      const increment = target / (duration / 16);
      const timer = setInterval(() => {
        start += increment;
        if (start >= target) {
          setCount(target);
          clearInterval(timer);
        } else {
          setCount(Math.floor(start));
        }
      }, 16);
      return () => clearInterval(timer);
    }
  }, [isInView, target]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
};

// FAQ Accordion Item
const FAQItem = ({ question, answer }: { question: string; answer: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between py-5 text-left font-semibold text-slate-900 hover:text-blue-600 transition-colors"
      >
        <span>{question}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-blue-600"
        >
          ↓
        </motion.span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-slate-600">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Section wrapper with scroll animations
const Section = ({ id, children, className = "" }: { id?: string; children: React.ReactNode; className?: string }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <motion.section
      id={id}
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`mx-auto max-w-7xl px-6 sm:px-8 ${className}`}
    >
      {children}
    </motion.section>
  );
};

function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAppSelector((state) => state.auth);
  const [activeNav, setActiveNav] = useState("hero");
  const [schoolInfo, setSchoolInfo] = useState(SCHOOL_INFO);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (user?.role === ROLES.CHAIRMAN) navigate('/chairman', { replace: true });
    else if (user?.role === ROLES.DIRECTOR) navigate('/director', { replace: true });
    else navigate('/department', { replace: true });
  }, [isAuthenticated, user, navigate]);

  useEffect(() => {
    let mounted = true;
    const loadSchoolInfo = async () => {
      try {
        const res = await fetch('/api/auth/school-info');
        if (!res.ok) return;
        const json = await res.json();
        if (mounted && json && json.data) {
          setSchoolInfo((prev) => ({
            ...prev,
            name: json.data.schoolName || prev.name,
            chairmanName: json.data.chairmanName || prev.chairmanName,
          }));
        }
      } catch {
        // keep defaults on error
      }
    };
    void loadSchoolInfo();
    return () => { mounted = false; };
  }, []);

  // Scroll spy for navbar
  useEffect(() => {
    const sections = document.querySelectorAll("section[id]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveNav(entry.target.id);
          }
        });
      },
      { threshold: 0.3, rootMargin: "-80px 0px -40% 0px" }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className="bg-gradient-to-b from-[#F8FAFC] via-white to-[#F8FAFC] text-[#0F172A] relative overflow-x-hidden">
      {/* Background decorative elements */}
      <FloatingShape className="top-20 left-[-10%] w-[500px] h-[500px] bg-blue-200/30" delay={0} />
      <FloatingShape className="bottom-40 right-[-5%] w-[400px] h-[400px] bg-indigo-200/20" delay={2} />
      <FloatingShape className="top-1/3 right-[20%] w-[300px] h-[300px] bg-cyan-200/20" delay={4} />

      {/* Sticky Navbar */}
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/50 shadow-sm"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg" />
            <div>
              <span className="block text-xs font-medium text-slate-500">{schoolInfo.name}</span>
              <span className="block text-lg font-bold bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
                {schoolInfo.appName}
              </span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium">
            {["Features", "How it works", "Dashboard", "Testimonials", "FAQ"].map((item) => {
              const id = item.toLowerCase().replace(/ /g, "-");
              return (
                <button
                  key={item}
                  onClick={() => scrollTo(id)}
                  className={`transition-colors hover:text-blue-600 relative ${
                    activeNav === id ? "text-blue-600" : "text-slate-600"
                  }`}
                >
                  {item}
                  {activeNav === id && (
                    <motion.div
                      layoutId="activeNav"
                      className="absolute -bottom-5 left-0 right-0 h-0.5 bg-blue-600"
                      transition={{ duration: 0.2 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <button
            onClick={() => navigate('/login')}
            className="rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:shadow-xl transition-all hover:scale-105"
          >
            Login
          </button>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <Section id="hero" className="pt-12 pb-20 lg:pt-20">
        <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:justify-between">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1"
          >
            <div className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-600 border border-blue-100">
              ✨ Next-Gen School Operations
            </div>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
              Build a smarter school operation with{" "}
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                centralized task management
              </span>
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-600 max-w-2xl">
              EduTask Pro helps school leadership organize assignments, monitor deadlines, and keep staff aligned with a modern responsive dashboard designed for education workflows.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/login')}
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-200 hover:shadow-xl transition-all"
              >
                Get Started Free
              </motion.button>
              <motion.a
                whileHover={{ scale: 1.02 }}
                href="#features"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/70 backdrop-blur-sm px-8 py-3.5 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-white transition-all"
              >
                Explore Platform
              </motion.a>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40, rotateY: 10 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 0.8, type: "spring" }}
            className="flex-1 relative"
          >
            <div className="rounded-2xl bg-white/50 backdrop-blur-sm border border-white/50 shadow-2xl p-6 overflow-hidden">
              <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                  <span className="text-xs text-slate-500 ml-2">dashboard.edutask.com</span>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl">
                    <div><p className="text-xs font-semibold">Science Dept. Assignment</p><p className="text-xs text-slate-500">Due: Tomorrow</p></div>
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">In Progress</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl">
                    <div><p className="text-xs font-semibold">Budget Review</p><p className="text-xs text-slate-500">Chairman approval</p></div>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">Delayed</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/60 rounded-xl">
                    <div><p className="text-xs font-semibold">Staff Meeting</p><p className="text-xs text-slate-500">Director's note</p></div>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Completed</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -z-10 -inset-4 bg-gradient-to-r from-blue-200 to-indigo-200 rounded-3xl blur-2xl opacity-40" />
          </motion.div>
        </div>
      </Section>

      {/* Statistics Section */}
      <Section id="statistics" className="py-16">
        <div className="grid grid-cols-2 gap-8 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-8 text-white shadow-2xl lg:grid-cols-4">
          {[
            { label: "Active Schools", target: 500, suffix: "+" },
            { label: "Tasks Completed", target: 125000, suffix: "+" },
            { label: "Department Users", target: 4800, suffix: "+" },
            { label: "Avg. Response Time", target: 2.4, suffix: "h" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-4xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                <AnimatedCounter target={stat.target} suffix={stat.suffix} />
              </div>
              <p className="mt-2 text-sm text-slate-300">{stat.label}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* How It Works */}
      <Section id="how-it-works" className="py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-sm font-semibold uppercase tracking-wider text-blue-600">Simple Workflow</span>
          <h2 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">From assignment to completion in three steps</h2>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {[
            { step: "01", title: "Assign Tasks", desc: "Directors and HODs create tasks with deadlines, priority levels, and department tags.", icon: "📋" },
            { step: "02", title: "Track Progress", desc: "Real-time status updates, automated delay alerts, and department-wise filtering.", icon: "📊" },
            { step: "03", title: "Review & Report", desc: "Leadership gets analytics on task completion, bottlenecks, and staff performance.", icon: "📈" },
          ].map((item, i) => (
            <motion.div
              key={i}
              whileHover={{ y: -8 }}
              className="relative rounded-2xl bg-white p-8 shadow-lg border border-slate-100 transition-all hover:shadow-xl"
            >
              <div className="text-5xl mb-4">{item.icon}</div>
              <div className="text-sm font-bold text-blue-600">{item.step}</div>
              <h3 className="mt-3 text-xl font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-slate-600">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* Why Choose Us */}
      <Section id="why-choose-us" className="py-20 bg-white/50 rounded-3xl my-8">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <span className="text-sm font-semibold uppercase tracking-wider text-blue-600">Why EduTask Pro</span>
            <h2 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">Built for educational excellence</h2>
            <p className="mt-6 text-slate-600">Unlike generic project tools, we understand school hierarchies, approval flows, and the need for role-based clarity across departments.</p>
            <div className="mt-8 space-y-4">
              {["Role-specific dashboards (Chairman → Director → Department)", "Automated delay detection & escalation", "Mobile-responsive for teachers on the go", "Enterprise-grade security & data privacy"].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs">✓</div>
                  <span className="text-slate-700">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-8 shadow-xl">
              <p className="font-semibold text-slate-800">"EduTask Pro reduced our task overdue rate by 74% within the first semester."</p>
              <div className="mt-6 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-200" />
                <div><p className="text-sm font-semibold">Navnath Dhawale</p><p className="text-xs text-slate-500">Chairperson, Adhira International School</p></div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Features Grid (Enhanced) */}
      <Section id="features" className="py-20">
        <div className="rounded-3xl bg-white/40 backdrop-blur-sm border border-white/50 p-8 shadow-xl">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-sm font-semibold uppercase tracking-wider text-blue-600">Powerful Features</span>
            <h2 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">Everything you need to manage school operations</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Task Tracking", desc: "View titles, due dates, priorities and statuses in a clear table.", icon: "✅" },
              { title: "Role Filtering", desc: "Show only tasks relevant to the logged-in role.", icon: "👥" },
              { title: "Delay Automation", desc: "Tasks past due date automatically switch to Delayed.", icon: "⏰" },
              { title: "Analytics Hub", desc: "Department performance and completion trends.", icon: "📊" },
            ].map((feature) => (
              <motion.div
                key={feature.title}
                whileHover={{ scale: 1.03 }}
                className="rounded-2xl bg-white p-6 shadow-md border border-slate-100 hover:shadow-xl transition-all"
              >
                <div className="text-3xl mb-3">{feature.icon}</div>
                <h3 className="font-semibold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Dashboard Preview Section */}
      <Section id="dashboard" className="py-20">
        <div className="rounded-3xl bg-gradient-to-r from-slate-900 to-slate-800 p-1 shadow-2xl">
          <div className="rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between mb-6">
              <div><h3 className="text-xl font-bold text-slate-900">Role-based Dashboard Preview</h3><p className="text-sm text-slate-500">Chairman | Director | Department views</p></div>
              <div className="flex gap-2"><div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" /><div className="h-2 w-2 rounded-full bg-blue-500" /><div className="h-2 w-2 rounded-full bg-blue-500" /></div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl bg-blue-50 p-4"><p className="font-semibold">Chairman</p><p className="text-xs text-slate-500">Institution-wide KPIs, budget approvals</p></div>
              <div className="rounded-xl bg-indigo-50 p-4"><p className="font-semibold">Director</p><p className="text-xs text-slate-500">Department coordination, resource allocation</p></div>
              <div className="rounded-xl bg-cyan-50 p-4"><p className="font-semibold">Department Head</p><p className="text-xs text-slate-500">Staff task assignment, progress monitoring</p></div>
            </div>
          </div>
        </div>
      </Section>

      {/* Testimonials Section */}
      <Section id="testimonials" className="py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-sm font-semibold uppercase tracking-wider text-blue-600">Trusted by Leaders</span>
          <h2 className="mt-4 text-3xl font-bold text-slate-900 sm:text-4xl">What education leaders say</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            { name: schoolInfo.chairmanName, role: `Chairman, ${schoolInfo.name}`, text: "EduTask Pro has revolutionized how we manage school operations and delegate tasks across departments efficiently.", highlighted: true },
            { name: "Rajesh Khanna", role: "Principal, Mumbai International", text: "Visibility into department tasks has transformed our administrative efficiency." },
            { name: "Anjali Nair", role: "Director of Academics", text: "The delay automation ensures nothing falls through the cracks." },
            { name: "Vikram Singh", role: "IT Head, Global School", text: "Clean UI and role-based access made adoption effortless." },
          ].map((t, i) => (
            <motion.div key={i} whileHover={{ y: -5 }} className={`rounded-2xl p-6 shadow-lg border transition-all ${t.highlighted ? "bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200" : "bg-white border-slate-100"}`}>
              <div className="flex gap-1 text-yellow-400 mb-3">★★★★★</div>
              <p className={`italic ${t.highlighted ? "text-slate-700 font-medium" : "text-slate-600"}`}>"{t.text}"</p>
              <div className="mt-4"><p className={`font-semibold ${t.highlighted ? "text-blue-900" : "text-slate-900"}`}>{t.name}</p><p className={`text-xs ${t.highlighted ? "text-blue-700" : "text-slate-500"}`}>{t.role}</p></div>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* AI Insights & Notification Preview */}
      <Section id="ai-insights" className="py-20">
        <div className="grid gap-8 lg:grid-cols-2">
          <motion.div whileHover={{ scale: 1.02 }} className="rounded-2xl bg-gradient-to-br from-purple-50 to-blue-50 p-8 shadow-lg">
            <div className="text-4xl mb-3">🧠</div>
            <h3 className="text-xl font-bold text-slate-900">AI-Powered Task Insights</h3>
            <p className="mt-2 text-slate-600">Predictive analytics on task completion, smart recommendations for resource reallocation.</p>
            <div className="mt-4 h-2 w-full rounded-full bg-slate-200"><div className="h-2 w-3/4 rounded-full bg-blue-500" /></div>
          </motion.div>
          <motion.div whileHover={{ scale: 1.02 }} className="rounded-2xl bg-white p-8 shadow-lg border border-slate-100 relative">
            <div className="absolute -top-3 -right-3 h-8 w-8 animate-bounce rounded-full bg-red-500 text-white text-xs flex items-center justify-center">🔔</div>
            <h3 className="text-xl font-bold text-slate-900">Real-time Notifications</h3>
            <p className="mt-2 text-slate-600">Task assignments, deadline reminders, approval requests delivered instantly.</p>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">📢 New task: "Q3 Budget Report" assigned to Finance Dept.</div>
          </motion.div>
        </div>
      </Section>

      {/* FAQ Accordion */}
      <Section id="faq" className="py-20">
        <div className="rounded-3xl bg-white/60 backdrop-blur-sm p-8 shadow-xl">
          <div className="text-center max-w-2xl mx-auto mb-8">
            <span className="text-sm font-semibold uppercase tracking-wider text-blue-600">FAQ</span>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">Common questions answered</h2>
          </div>
          <div className="mx-auto max-w-3xl">
            {[
              { q: "How does role-based access work?", a: "Chairman sees all tasks across departments, Director sees department-specific, and Department heads see only their team." },
              { q: "Can we customize task categories?", a: "Yes, administrators can define custom task types, priority levels, and department labels." },
              { q: "Is there a mobile app?", a: "We offer a fully responsive web app and native iOS/Android apps coming in Q3 2026." },
              { q: "What about data security?", a: "End-to-end encryption, SOC2 Type II compliance, and regular security audits." },
            ].map((faq, i) => (
              <FAQItem key={i} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </Section>

      {/* CTA Banner Before Footer */}
      <Section id="cta" className="py-20">
        <div className="rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-600 p-12 text-center text-white shadow-2xl">
          <h2 className="text-3xl font-bold">Ready to transform your school operations?</h2>
          <p className="mt-3 text-blue-100">Join 500+ schools already streamlining tasks with EduTask Pro.</p>
          <motion.button whileHover={{ scale: 1.05 }} onClick={() => navigate('/login')} className="mt-6 rounded-full bg-white px-8 py-3 font-semibold text-blue-600 shadow-lg hover:shadow-xl transition-all">
            Start Free Trial →
          </motion.button>
        </div>
      </Section>

      {/* Enhanced Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 py-12">
        <div className="mx-auto max-w-7xl px-6 sm:px-8">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2"><div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600" /><span className="font-bold text-slate-900">{schoolInfo.appName}</span></div>
              <div className="mt-2">
                <p className="text-sm font-semibold text-slate-700">{schoolInfo.name}</p>
                <p className="text-sm text-slate-500">Chairman: {schoolInfo.chairmanName}</p>
              </div>
              <p className="mt-4 text-sm text-slate-600">Empowering educational institutions with modern task management and analytics.</p>
              <div className="mt-4 flex gap-3"><span className="cursor-pointer text-slate-400 hover:text-slate-600">𝕏</span><span className="cursor-pointer text-slate-400 hover:text-slate-600">in</span><span className="cursor-pointer text-slate-400 hover:text-slate-600">📘</span></div>
            </div>
            <div><h4 className="font-semibold text-slate-900">Product</h4><ul className="mt-3 space-y-2 text-sm text-slate-600"><li>Features</li><li>Pricing</li><li>Dashboard</li><li>Integrations</li></ul></div>
            <div><h4 className="font-semibold text-slate-900">Company</h4><ul className="mt-3 space-y-2 text-sm text-slate-600"><li>About</li><li>Blog</li><li>Careers</li><li>Press</li></ul></div>
            <div><h4 className="font-semibold text-slate-900">Legal</h4><ul className="mt-3 space-y-2 text-sm text-slate-600"><li>Privacy</li><li>Terms</li><li>Security</li><li>GDPR</li></ul></div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 text-sm text-slate-500 md:flex-row">
            <p>© 2026 EduTask Pro. All rights reserved.</p>
            <div className="flex gap-4"><a href="#" className="hover:text-slate-700">Privacy Policy</a><a href="#" className="hover:text-slate-700">Terms of Service</a><a href="#" className="hover:text-slate-700">Cookie Preferences</a></div>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default LandingPage;