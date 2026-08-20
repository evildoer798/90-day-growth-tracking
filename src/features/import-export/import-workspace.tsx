"use client";

import { type FormEvent, useState, useTransition } from "react";
import type { ImportPreview as PreviewData } from "@/domain/import/training-plan-schema";
import { Button } from "@/components/ui/button"; import { Input } from "@/components/ui/input"; import { Label } from "@/components/ui/label";
import { applyTrainingPlanAction, previewTrainingPlanAction } from "@/server/actions/import.actions";
import { ImportPreview } from "./import-preview";

export function ImportWorkspace() { const [pending,startTransition]=useTransition();const [result,setResult]=useState<{preview:PreviewData;previewToken:string}|null>(null);const[error,setError]=useState<string|null>(null);const submit=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const data=new FormData(event.currentTarget);setError(null);startTransition(async()=>{try{setResult(await previewTrainingPlanAction(data));}catch(caught){setResult(null);setError(caught instanceof Error&&caught.message?caught.message:"无法读取工作簿，请检查格式后重试");}})};return <div className="admin-stack"><form className="admin-upload" encType="multipart/form-data" onSubmit={submit}><div className="form-field"><Label htmlFor="workbook">Excel 工作簿（.xlsx，最大 10 MB）</Label><Input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={pending} id="workbook" name="workbook" required type="file"/></div><Button disabled={pending} type="submit">{pending?"正在解析…":"上传并预览"}</Button></form>{error?<p className="form-error" role="alert">{error}</p>:null}{result?<ImportPreview onApply={applyTrainingPlanAction} preview={result.preview} previewToken={result.previewToken}/>:null}</div> }
