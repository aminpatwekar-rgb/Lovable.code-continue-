/** Key layouts for the on-screen math keyboard. `show` is LaTeX used to draw the key. */

export type Key = { show: string; latex: string; hint?: string; wide?: boolean };
export type KeyboardTab = { id: string; name: string; keys: Key[] };

const k = (show: string, latex = show, hint?: string): Key => ({ show, latex, ...(hint ? { hint } : {}) });
const fn = (name: string): Key => ({ show: `\\mathrm{${name}}`, latex: `\\${name} `, hint: name });

export const KEYBOARD_TABS: KeyboardTab[] = [
  {
    id: "basic",
    name: "123",
    keys: [
      k("7"), k("8"), k("9"), k("\\div", "\\div "), k("\\frac{a}{b}", "\\frac{#?}{#?}", "Fraction"),
      k("4"), k("5"), k("6"), k("\\times", "\\times "), k("x^{2}", "^{2}", "Square"),
      k("1"), k("2"), k("3"), k("-"), k("x^{n}", "^{#?}", "Power"),
      k("0"), k("."), k("="), k("+"), k("\\sqrt{x}", "\\sqrt{#?}", "Square root"),
      k("("), k(")"), k("x"), k("y"), k("z"),
      k("\\pi", "\\pi "), k("e"), k("\\pm", "\\pm "), k("\\%", "\\%"), k("\\sqrt[n]{x}", "\\sqrt[#?]{#?}", "Nth root"),
    ],
  },
  {
    id: "abc",
    name: "abc",
    keys: "abcdefghijklmnopqrstuvwxyz".split("").map((c) => k(c)),
  },
  {
    id: "calc",
    name: "Calc",
    keys: [
      k("\\int", "\\int ", "Integral"),
      k("\\int_{a}^{b}", "\\int_{#?}^{#?} ", "Definite integral"),
      k("\\iint", "\\iint "),
      k("\\oint", "\\oint "),
      k("\\frac{d}{dx}", "\\frac{d}{dx} ", "Derivative"),
      k("\\frac{\\partial}{\\partial x}", "\\frac{\\partial}{\\partial x} ", "Partial derivative"),
      k("\\partial", "\\partial "),
      k("\\nabla", "\\nabla "),
      k("\\sum", "\\sum_{i=1}^{n} ", "Sum"),
      k("\\prod", "\\prod_{i=1}^{n} ", "Product"),
      k("\\lim_{x\\to a}", "\\lim_{x \\to #?} ", "Limit"),
      k("\\infty", "\\infty "),
      k("f'(x)", "f'(x)"),
      k("f(x)", "f(x)"),
      k("dx", "\\,dx"),
      k("\\Delta x", "\\Delta x"),
      k("x_{n}", "_{#?}", "Subscript"),
      k("|x|", "\\left|#?\\right|", "Absolute value"),
      k("\\lfloor x\\rfloor", "\\lfloor #? \\rfloor"),
      k("\\lceil x\\rceil", "\\lceil #? \\rceil"),
      k("\\binom{n}{r}", "\\binom{#?}{#?}", "Choose"),
      k("n!", "!"),
      k("\\vec{v}", "\\vec{#?}", "Vector"),
      k("\\bar{x}", "\\bar{#?}", "Mean / bar"),
      k("\\hat{x}", "\\hat{#?}"),
      k("\\dot{x}", "\\dot{#?}"),
    ],
  },
  {
    id: "trig",
    name: "Trig & Log",
    keys: [
      fn("sin"), fn("cos"), fn("tan"), fn("cot"), fn("sec"), fn("csc"),
      k("\\sin^{-1}", "\\sin^{-1} "), k("\\cos^{-1}", "\\cos^{-1} "), k("\\tan^{-1}", "\\tan^{-1} "),
      fn("sinh"), fn("cosh"), fn("tanh"),
      fn("ln"), fn("log"), k("\\log_{b}", "\\log_{#?} "), k("e^{x}", "e^{#?}"),
      k("10^{x}", "10^{#?}"), k("\\exp", "\\exp "), fn("max"), fn("min"),
      k("\\theta", "\\theta "), k("\\alpha", "\\alpha "), k("\\beta", "\\beta "), k("^{\\circ}", "^{\\circ}", "Degree"),
      k("\\sin^{2}\\theta+\\cos^{2}\\theta=1", "\\sin^{2}\\theta+\\cos^{2}\\theta=1"),
    ],
  },
  {
    id: "symbols",
    name: "Symbols",
    keys: [
      k("\\neq", "\\neq "), k("\\approx", "\\approx "), k("\\equiv", "\\equiv "), k("\\propto", "\\propto "),
      k("<"), k(">"), k("\\le", "\\le "), k("\\ge", "\\ge "), k("\\ll", "\\ll "), k("\\gg", "\\gg "),
      k("\\cdot", "\\cdot "), k("\\circ", "\\circ "), k("\\ast", "\\ast "), k("\\mp", "\\mp "),
      k("\\to", "\\to "), k("\\Rightarrow", "\\Rightarrow "), k("\\Leftrightarrow", "\\Leftrightarrow "),
      k("\\leftarrow", "\\leftarrow "), k("\\uparrow", "\\uparrow "), k("\\downarrow", "\\downarrow "),
      k("\\therefore", "\\therefore "), k("\\because", "\\because "), k("\\angle", "\\angle "),
      k("\\perp", "\\perp "), k("\\parallel", "\\parallel "), k("\\triangle", "\\triangle "),
      k("\\cong", "\\cong "), k("\\sim", "\\sim "), k("\\overline{AB}", "\\overline{#?}"), k("\\overrightarrow{AB}", "\\overrightarrow{#?}"),
      k("\\in", "\\in "), k("\\notin", "\\notin "), k("\\subset", "\\subset "), k("\\subseteq", "\\subseteq "),
      k("\\cup", "\\cup "), k("\\cap", "\\cap "), k("\\emptyset", "\\emptyset "), k("\\setminus", "\\setminus "),
      k("\\forall", "\\forall "), k("\\exists", "\\exists "), k("\\neg", "\\neg "), k("\\land", "\\land "), k("\\lor", "\\lor "),
      k("\\mathbb{N}", "\\mathbb{N}"), k("\\mathbb{Z}", "\\mathbb{Z}"), k("\\mathbb{Q}", "\\mathbb{Q}"),
      k("\\mathbb{R}", "\\mathbb{R}"), k("\\mathbb{C}", "\\mathbb{C}"),
      k("\\{ \\}", "\\left\\{ #? \\right\\}"), k("[\\,]", "\\left[ #? \\right]"),
    ],
  },
  {
    id: "greek",
    name: "Greek",
    keys: [
      "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu",
      "nu", "xi", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
      "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Phi", "Psi", "Omega",
      "varepsilon", "varphi", "vartheta",
    ].map((n) => k(`\\${n}`, `\\${n} `)),
  },
  {
    id: "matrix",
    name: "Matrix",
    keys: [
      k("\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}", "\\begin{bmatrix} #? & #? \\\\ #? & #? \\end{bmatrix}", "2×2 matrix"),
      k("\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}", "\\begin{pmatrix} #? & #? \\\\ #? & #? \\end{pmatrix}", "2×2 matrix ( )"),
      k("\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}", "\\begin{vmatrix} #? & #? \\\\ #? & #? \\end{vmatrix}", "Determinant"),
      k("\\begin{bmatrix}a&b&c\\\\d&e&f\\\\g&h&i\\end{bmatrix}",
        "\\begin{bmatrix} #? & #? & #? \\\\ #? & #? & #? \\\\ #? & #? & #? \\end{bmatrix}", "3×3 matrix"),
      k("\\begin{bmatrix}x\\\\y\\end{bmatrix}", "\\begin{bmatrix} #? \\\\ #? \\end{bmatrix}", "Column vector"),
      k("\\begin{cases}a&x>0\\\\b&x\\le0\\end{cases}", "\\begin{cases} #? & #? \\\\ #? & #? \\end{cases}", "Piecewise"),
      k("A^{T}", "^{T}"), k("A^{-1}", "^{-1}"), k("\\det", "\\det "),
      k("\\vdots", "\\vdots "), k("\\cdots", "\\cdots "), k("\\ddots", "\\ddots "),
    ],
  },
  {
    id: "chem",
    name: "Chem",
    keys: [
      k("\\ce{H2O}", "\\ce{H2O}"), k("\\ce{CO2}", "\\ce{CO2}"), k("\\ce{->}", "\\ce{->}"), k("\\ce{<=>}", "\\ce{<=>}"),
      k("\\ce{(aq)}", "\\ce{(aq)}"), k("\\ce{(s)}", "\\ce{(s)}"), k("\\ce{(l)}", "\\ce{(l)}"), k("\\ce{(g)}", "\\ce{(g)}"),
      k("\\ce{SO4^2-}", "\\ce{SO4^2-}"), k("\\ce{Na+}", "\\ce{Na+}"), k("\\ce{^{14}_{6}C}", "\\ce{^{14}_{6}C}"),
      k("\\overset{\\Delta}{\\longrightarrow}", "\\overset{\\Delta}{\\longrightarrow}"),
    ],
  },
];
