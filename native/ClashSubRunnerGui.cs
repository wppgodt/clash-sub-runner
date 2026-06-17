using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;

internal static class Program
{
    private const string MutexName = "ClashSubRunner.NativeGui.SingleInstance";

    [STAThread]
    private static void Main()
    {
        bool created;
        using (Mutex mutex = new Mutex(true, MutexName, out created))
        {
            if (!created)
            {
                NativeMethods.FocusWindow("Clash Sub Runner");
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());
        }
    }
}

internal sealed class MainForm : Form
{
    private const int PreferredApiPort = 17980;
    private const int ApiPortFallbackCount = 10;

    private readonly string installDir;
    private readonly string backendExe;
    private readonly string iconPath;
    private readonly JavaScriptSerializer json;
    private readonly System.Windows.Forms.Timer timer;

    private Label coreValue;
    private Label proxyValue;
    private Label modeValue;
    private Label nodeValue;
    private Label sideCore;
    private Label sideProxy;
    private Label sideApi;
    private Label sideMode;
    private Label sideRegion;
    private Label refreshProgressText;
    private ProgressBar refreshProgress;
    private Label speedExternal;
    private Label speedCount;
    private Label speedProgressText;
    private ProgressBar speedProgress;
    private ComboBox regionCombo;
    private ComboBox nodeCombo;
    private Button ruleButton;
    private Button globalButton;
    private Button directButton;
    private Button refreshButton;
    private Button speedTestButton;
    private FlowLayoutPanel speedList;
    private TextBox logsBox;

    private Dictionary<string, object> currentStatus;
    private string lastSpeedSignature = "";
    private int apiPort;
    private bool busy;
    private bool refreshing;

    public MainForm()
    {
        installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
        backendExe = Path.Combine(installDir, "clash-sub-runner.exe");
        iconPath = Path.Combine(installDir, "app.ico");
        json = new JavaScriptSerializer();
        apiPort = PreferredApiPort;

        Text = "Clash Sub Runner";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(1120, 760);
        Size = new Size(1380, 900);
        if (File.Exists(iconPath))
        {
            Icon = new Icon(iconPath);
        }

        BuildUi();

        timer = new System.Windows.Forms.Timer();
        timer.Interval = 2000;
        timer.Tick += delegate { RefreshStatusAsync(); };
        timer.Start();

        ThreadPool.QueueUserWorkItem(delegate
        {
            EnsureBackend();
            BeginInvokeSafe(delegate { RefreshStatusAsync(); });
        });
    }

    private void BuildUi()
    {
        Color bg = Color.FromArgb(246, 247, 249);
        Color panel = Color.White;
        Color line = Color.FromArgb(217, 222, 231);
        Color navy = Color.FromArgb(24, 33, 47);
        Color text = Color.FromArgb(29, 36, 48);
        Color muted = Color.FromArgb(101, 112, 132);
        Color accent = Color.FromArgb(23, 105, 170);

        BackColor = bg;
        Font = new Font("Segoe UI", 9.5f);

        TableLayoutPanel root = new TableLayoutPanel();
        root.Dock = DockStyle.Fill;
        root.ColumnCount = 2;
        root.RowCount = 1;
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 280));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        Controls.Add(root);

        Panel sidebar = new Panel();
        sidebar.Dock = DockStyle.Fill;
        sidebar.BackColor = navy;
        sidebar.Padding = new Padding(18);
        root.Controls.Add(sidebar, 0, 0);

        FlowLayoutPanel sideFlow = new FlowLayoutPanel();
        sideFlow.Dock = DockStyle.Fill;
        sideFlow.FlowDirection = FlowDirection.TopDown;
        sideFlow.WrapContents = false;
        sideFlow.AutoScroll = true;
        sidebar.Controls.Add(sideFlow);

        Panel brand = new Panel();
        brand.Size = new Size(240, 42);
        brand.Margin = new Padding(0, 0, 0, 18);
        Label mark = new Label();
        mark.Text = "C";
        mark.TextAlign = ContentAlignment.MiddleCenter;
        mark.Font = new Font("Segoe UI", 14, FontStyle.Bold);
        mark.BackColor = Color.FromArgb(39, 161, 161);
        mark.ForeColor = Color.FromArgb(6, 16, 24);
        mark.Location = new Point(0, 4);
        mark.Size = new Size(34, 34);
        brand.Controls.Add(mark);
        Label title = new Label();
        title.Text = "Clash Sub Runner";
        title.ForeColor = Color.White;
        title.Font = new Font("Segoe UI", 12, FontStyle.Bold);
        title.Location = new Point(45, 8);
        title.Size = new Size(190, 28);
        brand.Controls.Add(title);
        sideFlow.Controls.Add(brand);

        sideCore = AddSidebarBlock(sideFlow, "Runtime", new string[] { "Core", "System proxy", "API" });
        sideProxy = (Label)sideCore.Tag;
        sideApi = (Label)sideProxy.Tag;
        sideMode = AddSidebarBlock(sideFlow, "Selection", new string[] { "Mode", "Region" });
        sideRegion = (Label)sideMode.Tag;
        AddSidebarMcp(sideFlow);

        TableLayoutPanel main = new TableLayoutPanel();
        main.Dock = DockStyle.Fill;
        main.Padding = new Padding(20);
        main.BackColor = bg;
        main.RowCount = 3;
        main.ColumnCount = 1;
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        main.RowStyles.Add(new RowStyle(SizeType.Absolute, 90));
        main.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.Controls.Add(main, 1, 0);

        Panel toolbar = new Panel();
        toolbar.Dock = DockStyle.Fill;
        Label heading = new Label();
        heading.Text = "VPN Console";
        heading.ForeColor = text;
        heading.Font = new Font("Segoe UI", 18, FontStyle.Bold);
        heading.Location = new Point(0, 7);
        heading.Size = new Size(260, 36);
        toolbar.Controls.Add(heading);

        Button start = MakeButton("Start", accent, Color.White);
        Button stop = MakeButton("Stop", Color.White, text);
        Button refresh = MakeButton("Refresh", Color.White, text);
        refreshButton = refresh;
        Button test = MakeButton("Speed Test", Color.White, text);
        speedTestButton = test;
        Button reset = MakeButton("Reset", Color.White, Color.FromArgb(180, 35, 24));
        Button[] tools = new Button[] { start, stop, refresh, test, reset };
        int x = 0;
        for (int i = tools.Length - 1; i >= 0; i--)
        {
            Button button = tools[i];
            button.Size = new Size(i == 3 ? 105 : 78, 36);
            button.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            x += button.Width + 8;
            button.Location = new Point(toolbar.Width - x, 6);
            toolbar.Controls.Add(button);
        }
        toolbar.Resize += delegate
        {
            int right = 0;
            for (int i = tools.Length - 1; i >= 0; i--)
            {
                right += tools[i].Width + 8;
                tools[i].Location = new Point(toolbar.Width - right, 6);
            }
        };
        start.Click += delegate { RunAction("/api/start", "{}", 120000); };
        stop.Click += delegate { RunAction("/api/stop", "{}", 120000); };
        refresh.Click += delegate { RunRefresh(); };
        test.Click += delegate { RunSpeedTest(); };
        reset.Click += delegate
        {
            if (MessageBox.Show(this, "Reset runtime state, system proxy, and cache?", "Reset", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
            {
                RunAction("/api/reset", "{}", 120000);
            }
        };
        main.Controls.Add(toolbar, 0, 0);

        TableLayoutPanel cards = new TableLayoutPanel();
        cards.Dock = DockStyle.Fill;
        cards.ColumnCount = 4;
        for (int i = 0; i < 4; i++) cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 25));
        cards.Padding = new Padding(0, 8, 0, 8);
        main.Controls.Add(cards, 0, 1);
        coreValue = AddMetric(cards, "Core", panel, line, muted, text);
        proxyValue = AddMetric(cards, "Proxy", panel, line, muted, text);
        modeValue = AddMetric(cards, "Mode", panel, line, muted, text);
        nodeValue = AddMetric(cards, "Node", panel, line, muted, text);

        TableLayoutPanel content = new TableLayoutPanel();
        content.Dock = DockStyle.Fill;
        content.ColumnCount = 2;
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 45));
        content.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 55));
        main.Controls.Add(content, 0, 2);

        TableLayoutPanel left = new TableLayoutPanel();
        left.Dock = DockStyle.Fill;
        left.RowCount = 2;
        left.RowStyles.Add(new RowStyle(SizeType.Absolute, 360));
        left.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        left.Padding = new Padding(0, 0, 10, 0);
        content.Controls.Add(left, 0, 0);

        Panel connection = MakePanel(panel, line);
        connection.Padding = new Padding(16);
        left.Controls.Add(connection, 0, 0);
        AddSectionTitle(connection, "Connection");

        Label modeLabel = SmallLabel("Mode", muted, 16, 44);
        connection.Controls.Add(modeLabel);
        ruleButton = MakeButton("Rule", Color.FromArgb(230, 240, 248), accent);
        globalButton = MakeButton("Global", Color.White, text);
        directButton = MakeButton("Direct", Color.White, text);
        ruleButton.Location = new Point(16, 66);
        globalButton.Location = new Point(150, 66);
        directButton.Location = new Point(284, 66);
        ruleButton.Size = globalButton.Size = directButton.Size = new Size(132, 34);
        connection.Controls.Add(ruleButton);
        connection.Controls.Add(globalButton);
        connection.Controls.Add(directButton);
        ruleButton.Click += delegate { SetMode("rule"); };
        globalButton.Click += delegate { SetMode("global"); };
        directButton.Click += delegate { SetMode("direct"); };

        connection.Controls.Add(SmallLabel("Region", muted, 16, 108));
        regionCombo = new ComboBox();
        regionCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        regionCombo.Location = new Point(16, 130);
        regionCombo.Size = new Size(402, 29);
        regionCombo.SelectedIndexChanged += delegate { RebuildNodeCombo(); };
        connection.Controls.Add(regionCombo);

        connection.Controls.Add(SmallLabel("Node", muted, 16, 168));
        nodeCombo = new ComboBox();
        nodeCombo.DropDownStyle = ComboBoxStyle.DropDownList;
        nodeCombo.Location = new Point(16, 190);
        nodeCombo.Size = new Size(402, 29);
        connection.Controls.Add(nodeCombo);

        Button apply = MakeButton("Apply", accent, Color.White);
        apply.Location = new Point(16, 236);
        apply.Size = new Size(194, 40);
        apply.Click += delegate { ApplyRegion(); };
        connection.Controls.Add(apply);

        Button copy = MakeButton("Copy command", Color.White, text);
        copy.Location = new Point(224, 236);
        copy.Size = new Size(194, 40);
        copy.Click += delegate
        {
            string region = SelectedRegionName();
            Clipboard.SetText(".\\clash-sub-runner.exe --cmd region \"" + region.Replace("\"", "\\\"") + "\"");
        };
        connection.Controls.Add(copy);

        refreshProgressText = SmallLabel("Refresh idle", muted, 16, 288);
        refreshProgressText.Size = new Size(402, 20);
        connection.Controls.Add(refreshProgressText);
        refreshProgress = new ProgressBar();
        refreshProgress.Minimum = 0;
        refreshProgress.Maximum = 100;
        refreshProgress.Value = 0;
        refreshProgress.Style = ProgressBarStyle.Continuous;
        refreshProgress.Location = new Point(16, 314);
        refreshProgress.Size = new Size(402, 14);
        refreshProgress.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        connection.Controls.Add(refreshProgress);

        Panel speed = MakePanel(panel, line);
        speed.Padding = new Padding(16);
        left.Controls.Add(speed, 0, 1);
        AddSectionTitle(speed, "Speed Test");
        speedExternal = AddSpeedStat(speed, "External", 16, 48);
        speedCount = AddSpeedStat(speed, "Nodes", 222, 48);
        speedProgressText = SmallLabel("Idle", Color.FromArgb(101, 112, 132), 16, 112);
        speedProgressText.Size = new Size(402, 20);
        speed.Controls.Add(speedProgressText);
        speedProgress = new ProgressBar();
        speedProgress.Minimum = 0;
        speedProgress.Maximum = 100;
        speedProgress.Value = 0;
        speedProgress.Style = ProgressBarStyle.Continuous;
        speedProgress.Location = new Point(16, 138);
        speedProgress.Size = new Size(402, 14);
        speedProgress.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        speed.Controls.Add(speedProgress);
        speedList = new BufferedFlowLayoutPanel();
        speedList.Location = new Point(16, 168);
        speedList.Size = new Size(402, 314);
        speedList.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        speedList.FlowDirection = FlowDirection.TopDown;
        speedList.WrapContents = false;
        speedList.AutoScroll = true;
        speedList.Resize += delegate { lastSpeedSignature = ""; };
        speed.Controls.Add(speedList);

        Panel logs = MakePanel(panel, line);
        logs.Padding = new Padding(16);
        content.Controls.Add(logs, 1, 0);
        AddSectionTitle(logs, "Logs");
        logsBox = new TextBox();
        logsBox.Multiline = true;
        logsBox.ReadOnly = true;
        logsBox.ScrollBars = ScrollBars.Vertical;
        logsBox.BackColor = Color.FromArgb(14, 20, 27);
        logsBox.ForeColor = Color.FromArgb(219, 234, 254);
        logsBox.Font = new Font("Consolas", 9);
        logsBox.Location = new Point(16, 56);
        logsBox.Size = new Size(520, 620);
        logsBox.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        logs.Controls.Add(logsBox);
    }

    private Label AddSidebarBlock(FlowLayoutPanel sideFlow, string title, string[] rows)
    {
        Panel block = new Panel();
        block.BackColor = Color.FromArgb(34, 45, 61);
        block.Size = new Size(240, rows.Length == 3 ? 126 : 96);
        block.Margin = new Padding(0, 0, 0, 14);
        Label titleLabel = new Label();
        titleLabel.Text = title;
        titleLabel.ForeColor = Color.FromArgb(203, 213, 225);
        titleLabel.Location = new Point(12, 12);
        titleLabel.Size = new Size(216, 20);
        block.Controls.Add(titleLabel);

        Label firstValue = null;
        Label previous = null;
        for (int i = 0; i < rows.Length; i++)
        {
            Label name = new Label();
            name.Text = rows[i];
            name.ForeColor = Color.White;
            name.Location = new Point(12, 42 + i * 26);
            name.Size = new Size(130, 22);
            block.Controls.Add(name);

            Label value = new Label();
            value.Text = "-";
            value.TextAlign = ContentAlignment.MiddleRight;
            value.ForeColor = Color.White;
            value.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            value.Location = new Point(144, 42 + i * 26);
            value.Size = new Size(80, 22);
            block.Controls.Add(value);
            if (firstValue == null) firstValue = value;
            if (previous != null) previous.Tag = value;
            previous = value;
        }
        sideFlow.Controls.Add(block);
        return firstValue;
    }

    private void AddSidebarMcp(FlowLayoutPanel sideFlow)
    {
        Panel block = new Panel();
        block.BackColor = Color.FromArgb(34, 45, 61);
        block.Size = new Size(240, 92);
        block.Margin = new Padding(0, 0, 0, 14);
        Label title = new Label();
        title.Text = "MCP command";
        title.ForeColor = Color.FromArgb(203, 213, 225);
        title.Location = new Point(12, 12);
        title.Size = new Size(216, 20);
        block.Controls.Add(title);
        Label path = new Label();
        path.Text = backendExe + " --mcp";
        path.ForeColor = Color.FromArgb(101, 112, 132);
        path.Location = new Point(12, 42);
        path.Size = new Size(216, 42);
        block.Controls.Add(path);
        sideFlow.Controls.Add(block);
    }

    private static Label AddMetric(TableLayoutPanel cards, string label, Color panel, Color line, Color muted, Color text)
    {
        Panel card = new Panel();
        card.BackColor = panel;
        card.Margin = new Padding(0, 0, 12, 0);
        card.Padding = new Padding(12);
        card.Paint += delegate(object sender, PaintEventArgs e) { DrawBorder(e.Graphics, card.ClientRectangle, line); };
        Label l = new Label();
        l.Text = label;
        l.ForeColor = muted;
        l.Location = new Point(12, 12);
        l.Size = new Size(180, 20);
        card.Controls.Add(l);
        Label v = new Label();
        v.Text = "-";
        v.ForeColor = text;
        v.Font = new Font("Segoe UI", 11, FontStyle.Bold);
        v.Location = new Point(12, 40);
        v.Size = new Size(220, 26);
        card.Controls.Add(v);
        cards.Controls.Add(card);
        card.Dock = DockStyle.Fill;
        return v;
    }

    private static Label AddSpeedStat(Control parent, string label, int x, int y)
    {
        Panel box = new Panel();
        box.BackColor = Color.FromArgb(248, 250, 252);
        box.Location = new Point(x, y);
        box.Size = new Size(194, 58);
        box.Paint += delegate(object sender, PaintEventArgs e) { DrawBorder(e.Graphics, box.ClientRectangle, Color.FromArgb(217, 222, 231)); };
        Label l = new Label();
        l.Text = label;
        l.ForeColor = Color.FromArgb(101, 112, 132);
        l.Location = new Point(10, 8);
        l.Size = new Size(160, 18);
        box.Controls.Add(l);
        Label v = new Label();
        v.Text = "-";
        v.Font = new Font("Segoe UI", 10, FontStyle.Bold);
        v.Location = new Point(10, 30);
        v.Size = new Size(170, 22);
        box.Controls.Add(v);
        parent.Controls.Add(box);
        return v;
    }

    private static Panel MakePanel(Color bg, Color line)
    {
        Panel p = new Panel();
        p.BackColor = bg;
        p.Dock = DockStyle.Fill;
        p.Margin = new Padding(0, 0, 0, 16);
        p.Paint += delegate(object sender, PaintEventArgs e) { DrawBorder(e.Graphics, p.ClientRectangle, line); };
        return p;
    }

    private static void AddSectionTitle(Control parent, string title)
    {
        Label label = new Label();
        label.Text = title;
        label.Font = new Font("Segoe UI", 12, FontStyle.Bold);
        label.Location = new Point(16, 14);
        label.Size = new Size(220, 26);
        parent.Controls.Add(label);
    }

    private static Label SmallLabel(string text, Color color, int x, int y)
    {
        Label label = new Label();
        label.Text = text;
        label.ForeColor = color;
        label.Location = new Point(x, y);
        label.Size = new Size(140, 20);
        return label;
    }

    private static Button MakeButton(string text, Color back, Color fore)
    {
        Button button = new Button();
        button.Text = text;
        button.BackColor = back;
        button.ForeColor = fore;
        button.FlatStyle = FlatStyle.Flat;
        button.FlatAppearance.BorderColor = Color.FromArgb(217, 222, 231);
        button.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
        return button;
    }

    private static void DrawBorder(Graphics g, Rectangle rect, Color line)
    {
        rect.Width -= 1;
        rect.Height -= 1;
        using (Pen p = new Pen(line))
        {
            g.DrawRectangle(p, rect);
        }
    }

    private void EnsureBackend()
    {
        int existing = FindCompatibleApiPort();
        if (existing > 0)
        {
            apiPort = existing;
            return;
        }

        if (!File.Exists(backendExe))
        {
            BeginInvokeSafe(delegate { MessageBox.Show(this, "Backend executable is missing: " + backendExe); });
            return;
        }

        for (int port = PreferredApiPort; port < PreferredApiPort + ApiPortFallbackCount; port++)
        {
            if (!IsLoopbackPortFree(port))
            {
                continue;
            }

            apiPort = port;
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = backendExe;
            psi.Arguments = "--no-open --ui-port " + port;
            psi.WorkingDirectory = installDir;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            Process process = Process.Start(psi);
            if (WaitForApi(port, process, 15000))
            {
                return;
            }
        }

        BeginInvokeSafe(delegate
        {
            logsBox.Text = "Could not start local GUI API. Ports " + PreferredApiPort + "-" + (PreferredApiPort + ApiPortFallbackCount - 1) + " are unavailable or blocked.";
        });
    }

    private int FindCompatibleApiPort()
    {
        for (int port = PreferredApiPort; port < PreferredApiPort + ApiPortFallbackCount; port++)
        {
            if (ApiAvailable(port))
            {
                return port;
            }
        }
        return 0;
    }

    private bool WaitForApi(int port, Process process, int timeoutMs)
    {
        DateTime deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
        while (DateTime.UtcNow < deadline)
        {
            if (ApiAvailable(port))
            {
                return true;
            }
            if (process != null && process.HasExited)
            {
                return false;
            }
            Thread.Sleep(250);
        }
        return false;
    }

    private bool ApiAvailable(int port)
    {
        try
        {
            Dictionary<string, object> status = ApiGet("/api/status", 1200, port);
            return IsCompatibleStatus(status);
        }
        catch
        {
            return false;
        }
    }

    private bool IsCompatibleStatus(Dictionary<string, object> status)
    {
        Dictionary<string, object> app = GetDict(status, "app");
        string baseDir = GetString(app, "baseDir");
        if (baseDir == "") return false;
        try
        {
            return String.Equals(Path.GetFullPath(baseDir).TrimEnd(Path.DirectorySeparatorChar), installDir, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }

    private static bool IsLoopbackPortFree(int port)
    {
        TcpListener listener = null;
        try
        {
            listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            return true;
        }
        catch
        {
            return false;
        }
        finally
        {
            if (listener != null) listener.Stop();
        }
    }

    private void RefreshStatusAsync()
    {
        if (refreshing) return;
        refreshing = true;
        ThreadPool.QueueUserWorkItem(delegate
        {
            try
            {
                Dictionary<string, object> status = ApiGet("/api/status", 5000);
                Dictionary<string, object> logs = ApiGet("/api/logs", 5000);
                BeginInvokeSafe(delegate
                {
                    currentStatus = status;
                    RenderStatus(status);
                    string logText = GetString(logs, "app");
                    if (logsBox.Text != logText) logsBox.Text = logText;
                });
            }
            catch (Exception ex)
            {
                BeginInvokeSafe(delegate { logsBox.Text = ex.Message; });
            }
            finally
            {
                refreshing = false;
            }
        });
    }

    private void RenderStatus(Dictionary<string, object> status)
    {
        bool running = GetBool(status, "running");
        bool ready = GetBool(status, "controllerReachable");
        string mode = GetString(status, "mode");
        string region = GetString(status, "selectedRegion");
        string node = GetString(status, "selectedNode");
        Dictionary<string, object> systemProxy = GetDict(status, "systemProxy");
        bool proxyOn = GetInt(systemProxy, "ProxyEnable") == 1 && GetString(systemProxy, "ProxyServer") == "127.0.0.1:7890";

        coreValue.Text = running ? "Running" : "Stopped";
        proxyValue.Text = proxyOn ? "127.0.0.1:7890" : "Not set";
        modeValue.Text = ModeText(mode);
        nodeValue.Text = node == "" ? "-" : node;
        sideCore.Text = running ? "Running" : "Stopped";
        sideProxy.Text = proxyOn ? "On" : "Off";
        sideApi.Text = ready ? "Ready" : "Down";
        sideMode.Text = ModeText(mode);
        sideRegion.Text = region == "" ? "-" : region;

        SetModeButton(ruleButton, mode == "rule");
        SetModeButton(globalButton, mode == "global");
        SetModeButton(directButton, mode == "direct");

        RebuildRegionCombo(status);
        RenderRefreshProgress(GetDict(GetDict(status, "state"), "refreshProgress"));
        RenderSpeed(GetDict(status, "state"));
    }

    private void RenderRefreshProgress(Dictionary<string, object> progress)
    {
        int percent = Math.Max(0, Math.Min(100, GetInt(progress, "percent")));
        bool active = GetBool(progress, "active");
        string phase = GetString(progress, "phase");
        bool cached = GetBool(progress, "cached");
        string error = GetString(progress, "error");

        if (refreshProgress != null)
        {
            refreshProgress.Value = percent;
        }
        if (refreshProgressText == null)
        {
            return;
        }

        if (active)
        {
            refreshProgressText.Text = (phase == "" ? "Refreshing subscription" : phase) + " - " + percent + "%";
            return;
        }
        if (cached)
        {
            refreshProgressText.Text = "Refresh used cached config" + (error == "" ? "" : ": " + error);
            if (refreshProgress != null) refreshProgress.Value = 100;
            return;
        }
        if (phase == "Refresh failed")
        {
            refreshProgressText.Text = "Refresh failed" + (error == "" ? "" : ": " + error);
            return;
        }
        if (phase != "")
        {
            refreshProgressText.Text = phase + " - " + percent + "%";
            return;
        }
        refreshProgressText.Text = "Refresh idle";
    }

    private void SetModeButton(Button button, bool active)
    {
        button.BackColor = active ? Color.FromArgb(230, 240, 248) : Color.White;
        button.ForeColor = active ? Color.FromArgb(15, 93, 149) : Color.FromArgb(29, 36, 48);
    }

    private void RebuildRegionCombo(Dictionary<string, object> status)
    {
        if (regionCombo.DroppedDown) return;
        string selected = regionCombo.SelectedItem == null ? GetString(status, "selectedRegion") : SelectedRegionName();
        if (selected == "") selected = GetString(status, "selectedRegion");
        ArrayList regions = GetArray(status, "regions");
        regionCombo.Items.Clear();
        foreach (object item in regions)
        {
            Dictionary<string, object> region = item as Dictionary<string, object>;
            if (region == null) continue;
            string name = GetString(region, "name");
            ArrayList nodes = GetArray(region, "nodes");
            regionCombo.Items.Add(name + " (" + nodes.Count + ")");
        }
        regionCombo.Enabled = regionCombo.Items.Count > 0;
        nodeCombo.Enabled = regionCombo.Items.Count > 0;
        if (regionCombo.Items.Count == 0)
        {
            nodeCombo.Items.Clear();
            return;
        }
        for (int i = 0; i < regionCombo.Items.Count; i++)
        {
            if (regionCombo.Items[i].ToString().StartsWith(selected + " ("))
            {
                regionCombo.SelectedIndex = i;
                break;
            }
        }
        if (regionCombo.SelectedIndex < 0 && regionCombo.Items.Count > 0) regionCombo.SelectedIndex = 0;
        RebuildNodeCombo();
    }

    private void RebuildNodeCombo()
    {
        if (currentStatus == null || nodeCombo.DroppedDown) return;
        string regionName = SelectedRegionName();
        string selectedNode = nodeCombo.SelectedItem == null ? GetString(currentStatus, "selectedNode") : nodeCombo.SelectedItem.ToString();
        nodeCombo.Items.Clear();
        foreach (object item in GetArray(currentStatus, "regions"))
        {
            Dictionary<string, object> region = item as Dictionary<string, object>;
            if (region == null || GetString(region, "name") != regionName) continue;
            foreach (object nodeObj in GetArray(region, "nodes"))
            {
                Dictionary<string, object> node = nodeObj as Dictionary<string, object>;
                if (node != null) nodeCombo.Items.Add(GetString(node, "name"));
            }
        }
        for (int i = 0; i < nodeCombo.Items.Count; i++)
        {
            if (nodeCombo.Items[i].ToString() == selectedNode)
            {
                nodeCombo.SelectedIndex = i;
                break;
            }
        }
        if (nodeCombo.SelectedIndex < 0 && nodeCombo.Items.Count > 0) nodeCombo.SelectedIndex = 0;
    }

    private string SelectedRegionName()
    {
        if (regionCombo.SelectedItem == null) return "";
        string value = regionCombo.SelectedItem.ToString();
        int idx = value.LastIndexOf(" (", StringComparison.Ordinal);
        return idx > 0 ? value.Substring(0, idx) : value;
    }

    private void RenderSpeed(Dictionary<string, object> state)
    {
        Dictionary<string, object> external = GetDict(state, "lastConnectivity");
        Dictionary<string, object> delay = GetDict(state, "lastDelayTest");
        Dictionary<string, object> progress = GetDict(state, "speedTestProgress");
        bool progressActive = GetBool(progress, "active");
        speedExternal.Text = progressActive && GetString(progress, "phase").StartsWith("Checking")
            ? "Testing"
            : external.Count == 0 ? "-" : (GetBool(external, "ok") ? "OK " + GetString(external, "ip") : "BAD");
        speedCount.Text = progressActive
            ? ProgressCountText(progress)
            : delay.Count == 0 ? "-" : GetInt(delay, "ok") + "/" + GetInt(delay, "total") + " OK";
        RenderSpeedProgress(progress, delay);

        string signature = BuildSpeedSignature(external, delay);
        if (signature == lastSpeedSignature && speedList.Controls.Count > 0) return;
        lastSpeedSignature = signature;

        speedList.SuspendLayout();
        try
        {
            speedList.Controls.Clear();

            if (external.Count > 0)
            {
                speedList.Controls.Add(MakeSpeedCard("External", GetBool(external, "ok") ? "Internet reachable" : GetString(external, "error"), GetBool(external, "ok"), 0));
            }
            foreach (object item in GetArray(delay, "results"))
            {
                Dictionary<string, object> result = item as Dictionary<string, object>;
                if (result == null) continue;
                speedList.Controls.Add(MakeSpeedCard(GetString(result, "region"), GetString(result, "name"), GetBool(result, "ok"), GetInt(result, "delay")));
            }
            if (speedList.Controls.Count == 0)
            {
                Label empty = new Label();
                empty.Text = "No test result yet.";
                empty.ForeColor = Color.FromArgb(101, 112, 132);
                empty.Size = new Size(350, 30);
                speedList.Controls.Add(empty);
            }
        }
        finally
        {
            speedList.ResumeLayout();
        }
    }

    private void RenderSpeedProgress(Dictionary<string, object> progress, Dictionary<string, object> delay)
    {
        int percent = Math.Max(0, Math.Min(100, GetInt(progress, "percent")));
        bool active = GetBool(progress, "active");
        string phase = GetString(progress, "phase");
        int current = GetInt(progress, "current");
        int total = GetInt(progress, "total");

        if (speedProgress != null)
        {
            speedProgress.Value = percent;
        }

        if (speedProgressText == null) return;
        if (active)
        {
            string count = total > 0 ? " (" + current + "/" + total + ")" : "";
            speedProgressText.Text = (phase == "" ? "Testing" : phase) + count + " - " + percent + "%";
            return;
        }

        if (phase == "Failed")
        {
            string error = GetString(progress, "error");
            speedProgressText.Text = "Failed" + (error == "" ? "" : ": " + error);
            return;
        }

        if (delay.Count > 0)
        {
            speedProgressText.Text = "Complete - " + GetInt(delay, "ok") + "/" + GetInt(delay, "total") + " OK";
            if (speedProgress != null) speedProgress.Value = 100;
            return;
        }

        speedProgressText.Text = "Idle";
    }

    private static string ProgressCountText(Dictionary<string, object> progress)
    {
        int current = GetInt(progress, "current");
        int total = GetInt(progress, "total");
        if (total > 0) return current + "/" + total;
        return "Testing";
    }

    private static string BuildSpeedSignature(Dictionary<string, object> external, Dictionary<string, object> delay)
    {
        StringBuilder sb = new StringBuilder();
        sb.Append("external:");
        if (external.Count == 0)
        {
            sb.Append("none");
        }
        else
        {
            sb.Append(GetBool(external, "ok"));
            sb.Append('|');
            sb.Append(GetString(external, "ip"));
            sb.Append('|');
            sb.Append(GetString(external, "error"));
        }
        sb.Append(";delay:");
        sb.Append(GetInt(delay, "ok"));
        sb.Append('/');
        sb.Append(GetInt(delay, "total"));
        foreach (object item in GetArray(delay, "results"))
        {
            Dictionary<string, object> result = item as Dictionary<string, object>;
            if (result == null) continue;
            sb.Append(';');
            sb.Append(GetString(result, "region"));
            sb.Append('|');
            sb.Append(GetString(result, "name"));
            sb.Append('|');
            sb.Append(GetBool(result, "ok"));
            sb.Append('|');
            sb.Append(GetInt(result, "delay"));
        }
        return sb.ToString();
    }

    private Control MakeSpeedCard(string region, string name, bool ok, int delay)
    {
        Color good = Color.FromArgb(24, 160, 88);
        Color mid = Color.FromArgb(47, 128, 201);
        Color slow = Color.FromArgb(217, 154, 0);
        Color bad = Color.FromArgb(214, 69, 53);
        Color color = !ok ? bad : delay == 0 || delay <= 300 ? good : delay <= 650 ? mid : slow;
        int width = Math.Max(340, speedList.ClientSize.Width - 28);

        Panel card = new Panel();
        card.BackColor = ok ? Color.White : Color.FromArgb(255, 248, 247);
        card.Size = new Size(width, 82);
        card.Margin = new Padding(0, 0, 0, 8);
        card.Paint += delegate(object sender, PaintEventArgs e) { DrawBorder(e.Graphics, card.ClientRectangle, Color.FromArgb(217, 222, 231)); };

        Label nameLabel = new Label();
        nameLabel.Text = name == "" ? "-" : name;
        nameLabel.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
        nameLabel.Location = new Point(12, 10);
        nameLabel.Size = new Size(width - 110, 22);
        card.Controls.Add(nameLabel);

        Label regionLabel = new Label();
        regionLabel.Text = region;
        regionLabel.ForeColor = Color.FromArgb(101, 112, 132);
        regionLabel.Location = new Point(12, 34);
        regionLabel.Size = new Size(width - 120, 18);
        card.Controls.Add(regionLabel);

        Label ms = new Label();
        ms.Text = ok ? (delay > 0 ? delay + " ms" : "OK") : "BAD";
        ms.ForeColor = color;
        ms.Font = new Font("Segoe UI", 11, FontStyle.Bold);
        ms.TextAlign = ContentAlignment.MiddleRight;
        ms.Location = new Point(width - 100, 14);
        ms.Size = new Size(84, 24);
        card.Controls.Add(ms);

        Panel track = new Panel();
        track.BackColor = Color.FromArgb(237, 241, 246);
        track.Location = new Point(12, 60);
        track.Size = new Size(width - 28, 7);
        card.Controls.Add(track);
        Panel fill = new Panel();
        fill.BackColor = color;
        int percent = ok ? (delay <= 0 ? 100 : Math.Max(8, Math.Min(100, 100 - delay / 12))) : 100;
        fill.Size = new Size(track.Width * percent / 100, 7);
        fill.Location = new Point(0, 0);
        track.Controls.Add(fill);
        return card;
    }

    private void SetMode(string mode)
    {
        RunAction("/api/mode", "{\"mode\":\"" + mode + "\"}", 120000);
    }

    private void ApplyRegion()
    {
        string node = nodeCombo.SelectedItem == null ? "" : nodeCombo.SelectedItem.ToString();
        string region = SelectedRegionName();
        if (region == "")
        {
            MessageBox.Show(this, "No region is available yet. Start the service or refresh the subscription first.", "Clash Sub Runner", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        string body = json.Serialize(new Dictionary<string, object> { { "region", region }, { "node", node } });
        RunAction("/api/region", body, 120000);
    }

    private void RunSpeedTest()
    {
        if (busy) return;
        busy = true;
        SetSpeedTesting(true);
        lastSpeedSignature = "";
        speedExternal.Text = "Testing";
        speedCount.Text = "Testing";
        speedProgressText.Text = "Starting speed test - 0%";
        speedProgress.Value = 0;
        speedList.SuspendLayout();
        try
        {
            speedList.Controls.Clear();
            Label loading = new Label();
            loading.Text = "Testing external IP and node delays...";
            loading.ForeColor = Color.FromArgb(101, 112, 132);
            loading.Size = new Size(350, 30);
            speedList.Controls.Add(loading);
        }
        finally
        {
            speedList.ResumeLayout();
        }
        ThreadPool.QueueUserWorkItem(delegate
        {
            try
            {
                ApiPost("/api/connectivity", "{}", 120000);
                ApiPost("/api/test", "{}", 120000);
            }
            catch (Exception ex)
            {
                BeginInvokeSafe(delegate
                {
                    lastSpeedSignature = "";
                    speedExternal.Text = "Failed";
                    speedCount.Text = "-";
                    speedList.Controls.Clear();
                    speedList.Controls.Add(MakeSpeedCard("Speed Test", ex.Message, false, 0));
                    MessageBox.Show(this, ex.Message, "Speed Test", MessageBoxButtons.OK, MessageBoxIcon.Error);
                });
            }
            finally
            {
                busy = false;
                BeginInvokeSafe(delegate
                {
                    SetSpeedTesting(false);
                    RefreshStatusAsync();
                });
            }
        });
    }

    private void RunRefresh()
    {
        if (busy) return;
        busy = true;
        SetRefreshRunning(true);
        if (refreshProgressText != null) refreshProgressText.Text = "Refreshing subscription - 0%";
        if (refreshProgress != null) refreshProgress.Value = 0;
        ThreadPool.QueueUserWorkItem(delegate
        {
            try
            {
                Dictionary<string, object> result = ApiPost("/api/refresh", "{}", 160000);
                if (GetBool(result, "cached"))
                {
                    BeginInvokeSafe(delegate
                    {
                        if (refreshProgressText != null) refreshProgressText.Text = GetString(result, "warning");
                        if (refreshProgress != null) refreshProgress.Value = 100;
                    });
                }
            }
            catch (Exception ex)
            {
                BeginInvokeSafe(delegate { MessageBox.Show(this, ex.Message, "Refresh", MessageBoxButtons.OK, MessageBoxIcon.Error); });
            }
            finally
            {
                busy = false;
                BeginInvokeSafe(delegate
                {
                    SetRefreshRunning(false);
                    RefreshStatusAsync();
                });
            }
        });
    }

    private void SetRefreshRunning(bool running)
    {
        if (refreshButton == null) return;
        refreshButton.Enabled = !running;
        refreshButton.Text = running ? "Refreshing..." : "Refresh";
    }

    private void SetSpeedTesting(bool testing)
    {
        if (speedTestButton == null) return;
        speedTestButton.Enabled = !testing;
        speedTestButton.Text = testing ? "Testing..." : "Speed Test";
    }

    private void RunAction(string path, string body, int timeout)
    {
        if (busy) return;
        busy = true;
        ThreadPool.QueueUserWorkItem(delegate
        {
            try
            {
                ApiPost(path, body, timeout);
            }
            catch (Exception ex)
            {
                BeginInvokeSafe(delegate { MessageBox.Show(this, ex.Message, "Clash Sub Runner", MessageBoxButtons.OK, MessageBoxIcon.Error); });
            }
            finally
            {
                busy = false;
                BeginInvokeSafe(delegate { RefreshStatusAsync(); });
            }
        });
    }

    private Dictionary<string, object> ApiGet(string path, int timeout)
    {
        return ApiGet(path, timeout, apiPort);
    }

    private Dictionary<string, object> ApiGet(string path, int timeout, int port)
    {
        return ParseResponse(Request("GET", path, null, timeout, port));
    }

    private Dictionary<string, object> ApiPost(string path, string body, int timeout)
    {
        return ParseResponse(Request("POST", path, body, timeout, apiPort));
    }

    private string Request(string method, string path, string body, int timeout, int port)
    {
        HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + path);
        req.Method = method;
        req.Timeout = timeout;
        req.ReadWriteTimeout = timeout;
        // The app manages the Windows system proxy, so local control API calls must stay direct.
        req.Proxy = null;
        if (body != null)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(body);
            req.ContentType = "application/json";
            req.ContentLength = bytes.Length;
            using (Stream stream = req.GetRequestStream())
            {
                stream.Write(bytes, 0, bytes.Length);
            }
        }
        try
        {
            using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
            using (StreamReader reader = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
            {
                return reader.ReadToEnd();
            }
        }
        catch (WebException ex)
        {
            throw new Exception(ReadWebException(ex));
        }
    }

    private static string ReadWebException(WebException ex)
    {
        HttpWebResponse response = ex.Response as HttpWebResponse;
        if (response == null)
        {
            return ex.Message;
        }
        try
        {
            using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
            {
                string text = reader.ReadToEnd();
                return String.IsNullOrWhiteSpace(text) ? ex.Message : text;
            }
        }
        catch
        {
            return ex.Message;
        }
    }

    private Dictionary<string, object> ParseResponse(string text)
    {
        if (String.IsNullOrWhiteSpace(text)) return new Dictionary<string, object>();
        object parsed = json.DeserializeObject(text);
        Dictionary<string, object> dict = parsed as Dictionary<string, object>;
        return dict == null ? new Dictionary<string, object>() : dict;
    }

    private static Dictionary<string, object> GetDict(Dictionary<string, object> dict, string key)
    {
        if (dict == null || !dict.ContainsKey(key)) return new Dictionary<string, object>();
        Dictionary<string, object> value = dict[key] as Dictionary<string, object>;
        return value == null ? new Dictionary<string, object>() : value;
    }

    private static ArrayList GetArray(Dictionary<string, object> dict, string key)
    {
        if (dict == null || !dict.ContainsKey(key)) return new ArrayList();
        ArrayList value = dict[key] as ArrayList;
        if (value != null) return value;
        object[] values = dict[key] as object[];
        return values == null ? new ArrayList() : new ArrayList(values);
    }

    private static string GetString(Dictionary<string, object> dict, string key)
    {
        if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return "";
        return Convert.ToString(dict[key]);
    }

    private static bool GetBool(Dictionary<string, object> dict, string key)
    {
        if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return false;
        try { return Convert.ToBoolean(dict[key]); } catch { return false; }
    }

    private static int GetInt(Dictionary<string, object> dict, string key)
    {
        if (dict == null || !dict.ContainsKey(key) || dict[key] == null) return 0;
        try { return Convert.ToInt32(dict[key]); } catch { return 0; }
    }

    private static string ModeText(string mode)
    {
        if (mode == "rule") return "Rule";
        if (mode == "global") return "Global";
        if (mode == "direct") return "Direct";
        return "-";
    }

    private void BeginInvokeSafe(MethodInvoker action)
    {
        if (IsDisposed) return;
        try
        {
            if (InvokeRequired) BeginInvoke(action);
            else action();
        }
        catch
        {
        }
    }
}

internal sealed class BufferedFlowLayoutPanel : FlowLayoutPanel
{
    public BufferedFlowLayoutPanel()
    {
        DoubleBuffered = true;
        ResizeRedraw = true;
    }
}

internal static class NativeMethods
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string className, string windowName);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    public static void FocusWindow(string title)
    {
        IntPtr hwnd = FindWindow(null, title);
        if (hwnd != IntPtr.Zero)
        {
            ShowWindow(hwnd, 9);
            SetForegroundWindow(hwnd);
        }
    }
}
