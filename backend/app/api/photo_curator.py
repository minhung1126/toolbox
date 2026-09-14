"""API router for Photo Curator tool."""

from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from backend.app.core.dependencies import require_account_subject

router = APIRouter(prefix="/photo-curator", tags=["Photo Curator"])


class PresetBucket(BaseModel):
    id: str
    title: str
    description: str
    default_theme: str


class PresetTemplate(BaseModel):
    id: str
    name: str
    description: str
    buckets: List[PresetBucket]


PRESET_TEMPLATES: List[PresetTemplate] = [
    PresetTemplate(
        id="theme-perspective",
        name="主題視角型（推薦）",
        description="按畫面視角分流，平衡空間氛圍、人物穿搭與細節特寫，最受歡喜的 IG 風格",
        buckets=[
            PresetBucket(
                id="post-1",
                title="空間大景 (Space & Vibe)",
                description="空間環境、建築光影、全景氣氛（建立情境氛圍）",
                default_theme="空間大景",
            ),
            PresetBucket(
                id="post-2",
                title="人物穿搭 (Portrait & Outfit)",
                description="個人穿搭、全身/半身人像、互動合照（視覺核心人物）",
                default_theme="人物穿搭",
            ),
            PresetBucket(
                id="post-3",
                title="細節美食 (Details & Taste)",
                description="餐點特寫、桌上小物、局部微距（質感記憶點）",
                default_theme="細節美食",
            ),
        ],
    ),
    PresetTemplate(
        id="chronological",
        name="時序敘事型",
        description="按時間先後推進，呈現活動或旅程的起承轉合",
        buckets=[
            PresetBucket(
                id="post-1",
                title="啟程破題 (Start & First Look)",
                description="出發、初來乍到、第一亮點與外觀",
                default_theme="啟程破題",
            ),
            PresetBucket(
                id="post-2",
                title="核心體驗 (Peak & Highlight)",
                description="主活動、精彩體驗、高潮互動環節",
                default_theme="核心體驗",
            ),
            PresetBucket(
                id="post-3",
                title="尾聲收尾 (Night & Wrap-up)",
                description="夜景、落幕、花絮收尾與心得短語",
                default_theme="尾聲收尾",
            ),
        ],
    ),
    PresetTemplate(
        id="three-days",
        name="三日行程型",
        description="適合週末小旅行或連續三日記錄",
        buckets=[
            PresetBucket(
                id="post-1",
                title="Day 1",
                description="第一天行程與亮點記錄",
                default_theme="Day 1",
            ),
            PresetBucket(
                id="post-2",
                title="Day 2",
                description="第二天行程與深度體驗",
                default_theme="Day 2",
            ),
            PresetBucket(
                id="post-3",
                title="Day 3",
                description="第三天行程、採買與賦歸",
                default_theme="Day 3",
            ),
        ],
    ),
]


class ChecklistRequestItem(BaseModel):
    post_index: int = Field(..., ge=1, le=10, description="Post index 1, 2, or 3")
    title: str = Field(default="", max_length=200)
    cover_filename: str = Field(default="", max_length=500)
    photo_count: int = Field(default=0, ge=0)
    photo_filenames: List[str] = Field(default_factory=list)


class ChecklistRequest(BaseModel):
    posts: List[ChecklistRequestItem] = Field(default_factory=list)
    notes: str = Field(default="", max_length=5000)
    unassigned_filenames: List[str] = Field(default_factory=list)


class ChecklistResponse(BaseModel):
    markdown_checklist: str


@router.get("/presets", response_model=List[PresetTemplate])
def get_preset_templates(
    _owner_sub: str = Depends(require_account_subject),
) -> List[PresetTemplate]:
    """Return preset curation models for 3-part social media posts."""
    return PRESET_TEMPLATES


@router.post("/checklist", response_model=ChecklistResponse)
def generate_checklist(
    req: ChecklistRequest,
    _owner_sub: str = Depends(require_account_subject),
) -> ChecklistResponse:
    """Generate a clean markdown posting checklist for 3-part posts."""
    lines = [
        "# Instagram 貼文三部曲發布對照表",
        "",
        "> 本清單可作為社群排程、手機照片選取與貼文發布之快速對照。",
        "",
    ]
    for item in req.posts:
        lines.append(f"## 【Post {item.post_index}】{item.title}（共 {item.photo_count} 張）")
        if item.cover_filename:
            lines.append(f"- **★ 首圖 (Cover)**：`{item.cover_filename}`")
        if item.photo_filenames:
            lines.append("- **輪播照片清單**：")
            for idx, fn in enumerate(item.photo_filenames, start=1):
                is_cover = " (★ 封面)" if idx == 1 else ""
                lines.append(f"  {idx}. `{fn}`{is_cover}")
        lines.append(f"- **建議標籤**：`#Part{item.post_index}` `#Instagram`")
        lines.append("")

    if req.unassigned_filenames:
        lines.append(f"## 未分配備忘照片（共 {len(req.unassigned_filenames)} 張）")
        for fn in req.unassigned_filenames:
            lines.append(f"- `{fn}`")
        lines.append("")

    if req.notes:
        lines.append("## 備忘筆記")
        lines.append(req.notes)
        lines.append("")

    return ChecklistResponse(markdown_checklist="\n".join(lines))
