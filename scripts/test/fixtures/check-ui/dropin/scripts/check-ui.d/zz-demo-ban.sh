# A demo rule for scripts/test/check-ui_test.sh: what a package's own scripts/check-ui.d/<slug>.sh looks like.
# check-ui.sh sources every check-ui.d/*.sh before it reads the rules files; the file registers its rule and defines rule_<name>
# (hyphens become underscores). The helpers viol, src_files, css_scan and code_match are there when the function runs.
register_rule demo-ban
rule_demo_ban() {
  src_files tsx | code_match demo-ban "demo-ban; FORBIDDEN_DEMO is not allowed here" 'FORBIDDEN_DEMO'
}
