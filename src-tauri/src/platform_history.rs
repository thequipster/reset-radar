//! v3运行时完整公告历史。来源：TRUTH B07 / v3 §3.2，分页契约与fetch-history.mjs一致。
use std::{collections::HashSet, time::Duration};
use serde_json::{json, Value};
use chrono::{SecondsFormat, Utc};

fn page_cursor(page: &Value) -> Result<Option<String>, String> {
    if !page.get("data").is_some_and(Value::is_array) || !page.get("meta").is_some_and(Value::is_object) {
        return Err("history page missing data/meta".into());
    }
    let p = page.get("pagination").ok_or("history missing pagination")?;
    match p.get("has_more").and_then(Value::as_bool) {
        Some(false) if p.get("next_cursor").is_none_or(Value::is_null) => Ok(None),
        Some(true) => p.get("next_cursor").and_then(Value::as_str).filter(|s| !s.is_empty())
            .map(|s| Some(s.to_owned())).ok_or("history next cursor missing".into()),
        _ => Err("ambiguous history pagination".into()),
    }
}

#[tauri::command]
pub async fn fetch_platform_history() -> Result<Value, String> {
    // 4s单页上游超时沿用reset_status；总计30s和100页为有限资源保护，不是数据完整性事实。
    tokio::time::timeout(Duration::from_secs(30), fetch_all()).await
        .map_err(|_| "platform history total timeout".to_owned())?
}

async fn fetch_all() -> Result<Value, String> {
    // 翻页期间可能新增头部公告；完成时刻不能当作已完整观察到的截止。
    let coverage_through=Utc::now().to_rfc3339_opts(SecondsFormat::Millis,true);
    let client=reqwest::Client::builder().timeout(Duration::from_secs(4)).build().map_err(|e|e.to_string())?;
    let mut cursor:Option<String>=None;
    let mut cursors=HashSet::new();
    let mut ids=HashSet::new();
    let mut events=Vec::new();
    for index in 0..100 {
        let mut request=client.get("https://codex-resets.com/api/v1/resets")
            .query(&[("limit","100"),("order","desc")]);
        if let Some(ref c)=cursor {request=request.query(&[("cursor",c)]);}
        let page:Value=request.send().await.map_err(|e|e.to_string())?.error_for_status()
            .map_err(|e|e.to_string())?.json().await.map_err(|e|e.to_string())?;
        let next=page_cursor(&page)?;
        for raw in page["data"].as_array().ok_or("history data invalid")? {
            let id=match &raw["id"] {Value::String(s)=>s.clone(),Value::Number(n)=>n.to_string(),_=>return Err("history event lacks ID".into())};
            let at=raw["announced_at"].as_str().ok_or("history event lacks announced_at")?;
            chrono::DateTime::parse_from_rfc3339(at).map_err(|e|e.to_string())?;
            let kind=raw["reset_type"].as_str().ok_or("history event lacks reset_type")?;
            if ids.insert(id.clone()) {
                events.push(json!({"id":id,"resetType":kind,"announcedAt":at,"text":raw["text"],
                    "source":raw["source"],"relatedEventIds":raw["related_event_ids"].as_array().cloned().unwrap_or_default()}));
            }
        }
        if let Some(next)=next {
            if !cursors.insert(next.clone()) {return Err("history pagination cursor loop".into());}
            cursor=Some(next);
        } else {
            return Ok(json!({"fetchedAt":Utc::now().to_rfc3339_opts(SecondsFormat::Millis,true),"coverageThrough":coverage_through,"events":events,
                "upstream":{"pagination":{"has_more":false,"next_cursor":null,"pages_fetched":index+1}}}));
        }
    }
    Err("history pagination exceeded 100 pages; incomplete history rejected".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn complete_and_continuing_pages_are_distinct() {
        assert_eq!(page_cursor(&json!({"data":[],"meta":{},"pagination":{"has_more":false,"next_cursor":null}})).unwrap(),None);
        assert_eq!(page_cursor(&json!({"data":[],"meta":{},"pagination":{"has_more":true,"next_cursor":"next"}})).unwrap(),Some("next".into()));
    }
    #[test]
    fn incomplete_or_contradictory_pages_fail_closed() {
        for p in [json!({}),json!({"has_more":true}),json!({"has_more":false,"next_cursor":"next"})] {
            assert!(page_cursor(&json!({"data":[],"meta":{},"pagination":p})).is_err());
        }
    }
}
