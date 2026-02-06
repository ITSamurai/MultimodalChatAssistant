Feature: Registration

  Scenario: Successful registration with valid credentials
  Given I am on the registration page
  When I enter valid username and password
  Then I should see a confirmation message