Pod::Spec.new do |s|
  s.name           = 'DinkLink'
  s.version        = '1.0.0'
  s.summary        = 'Finds and connects two nearby Dink Club phones for a rally.'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'Dink Club'
  s.homepage       = 'https://example.invalid/dink-club'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { path: '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
