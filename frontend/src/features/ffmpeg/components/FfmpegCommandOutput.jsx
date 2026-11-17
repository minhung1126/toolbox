import { Check, ChevronDown, ChevronUp, Copy, Terminal } from 'lucide-react';
export default function FfmpegCommandOutput({ workflow }) {
  const {
    shellDialect,
    lineLayout,
    setShellDialect,
    setLineLayout,
    inputName,
    outputName,
    generatedCommand,
    copied,
    handleCopyCommand,
    showAdvanced,
    setInputName,
    setOutputName,
    setShowAdvanced,
  } = workflow;
  return (
    <section className="glass-panel card-padding ffmpeg-output-section" aria-label="FFmpeg 命令行與複製">
      <div className="output-header-row">
        <div className="title-with-icon">
          <Terminal size={18} className="text-primary" />
          <h2>生成的 FFmpeg 命令行</h2>
        </div>

        {/* Shell dialect toggles */}
        <div className="shell-toggle-group">
          <label>
            執行環境{' '}
            <select
              className="ui-text-field"
              aria-label="執行環境"
              value={shellDialect}
              onChange={(event) => setShellDialect(event.target.value)}
            >
              <option value="bash">Bash</option>
              <option value="powershell">PowerShell 7.3+</option>
              <option value="cmd">CMD</option>
            </select>
          </label>
          <label>
            指令排版{' '}
            <select
              className="ui-text-field"
              aria-label="指令排版"
              value={lineLayout}
              onChange={(event) => setLineLayout(event.target.value)}
            >
              <option value="single">單行指令</option>
              <option value="multiline">多行指令</option>
            </select>
          </label>
        </div>
      </div>

      {/* Filename Inputs */}
      <div className="filename-inputs-grid">
        <div className="ui-field">
          <label className="ui-field-label" htmlFor="ffmpeg-input-name">
            輸入檔名 (Input File)
            <span className="text-dim text-xs ml-2">依執行環境引用參數</span>
          </label>
          <input
            id="ffmpeg-input-name"
            type="text"
            className="ui-text-field"
            value={inputName}
            onChange={(e) => setInputName(e.target.value)}
            placeholder="input.mp4"
          />
        </div>
        <div className="ui-field">
          <label className="ui-field-label" htmlFor="ffmpeg-output-name">
            輸出檔名 (Output File)
            <span className="text-dim text-xs ml-2">依執行環境引用參數</span>
          </label>
          <input
            id="ffmpeg-output-name"
            type="text"
            className="ui-text-field"
            value={outputName}
            onChange={(e) => setOutputName(e.target.value)}
            placeholder="output.mp4"
          />
        </div>
      </div>

      <p className="text-dim">請先在電腦安裝 FFmpeg，於檔案所在目錄開啟 {shellDialect}，貼上指令執行。影片不會上傳。</p>
      {shellDialect === 'powershell' && (
        <p>
          需使用 PowerShell 7.3 以上，並設定 $PSNativeCommandArgumentPassing =
          &apos;Standard&apos;，以原樣傳入含引號的參數。
        </p>
      )}
      {Object.entries(generatedCommand.errors).map(([field, message]) => (
        <p role="alert" key={field}>
          {{ inputName: '輸入檔名', outputName: '輸出檔名', startTime: '起點', endTime: '終點', durationCut: '長度' }[
            field
          ] || field}
          ：{message}
        </p>
      ))}
      {/* Code Terminal Box */}
      <div className="command-terminal-box">
        <pre className="command-code">
          <code>{generatedCommand.activeCommand}</code>
        </pre>
        <button
          type="button"
          className={`btn btn-copy-command ${copied ? 'btn-success' : 'btn-primary'}`}
          disabled={Object.keys(generatedCommand.errors).length > 0}
          onClick={handleCopyCommand}
          aria-label="一鍵複製命令行"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          <span>{copied ? '已複製指令！' : '一鍵複製命令行'}</span>
        </button>
      </div>

      {/* Collapsible Parameter Breakdown Table */}
      <div className="breakdown-collapsible">
        <button
          type="button"
          className="btn-collapse-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
        >
          <span>參數白話解析 ({generatedCommand.breakdown.length} 項參數)</span>
          {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showAdvanced && (
          <div className="breakdown-table-wrapper">
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th>指令參數</th>
                  <th>作用說明</th>
                </tr>
              </thead>
              <tbody>
                {generatedCommand.breakdown.map((item, idx) => (
                  <tr key={idx}>
                    <td className="param-code">
                      <code>{item.flag}</code>
                    </td>
                    <td className="param-desc">{item.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
