export interface ScanTemplate {
  issue_id: string
  issue_name: string
  issue_remediation?: string
  issue_severity: string
  issue_status: string
  static_issue_description: string
  issue_description?: string
  issue_confidence: string
  metric_wise_aggregated_findings?: Record<string, any>[]
}

export interface ScanDetails {
  issue_id: string
  no_of_findings: string
  metric_wise_aggregated_findings?: Record<string, any>[]
  positions?: string
  template_details: ScanTemplate
  file_name: string
}

export interface ScanReport {
  details_enabled: boolean
  file_url_list: string[]
  multi_file_scan_details: ScanDetails[]
  multi_file_scan_summary: Record<string, any>
  multi_file_scan_status: string
  scan_id: string
  scan_status: string
  scan_type: string
}