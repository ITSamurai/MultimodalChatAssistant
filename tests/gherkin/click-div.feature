Feature: Discovery: div_active-orders-btn-delivery

  Scenario: Test clickable: Click Դուք չունեք ընթացիկ պատվերներԳնել հիմա div
  Given I am on 'https://buy.am/'
  When I click '#active-orders-btn-delivery'
  Then the element '#query' should have attribute 'style' containing 'caret-color: transparent !important;'
  And the element 'a[href="/supermarkets"]' should have attribute 'style' containing 'min-width: 786px; max-width: 786px; transform: translate3d(-1604px, 0px, 0px);'
  And the element 'a[href="/shops"]' should have attribute 'style' containing 'min-width: 786px; max-width: 786px; transform: translate3d(-1588px, 0px, 0px);'