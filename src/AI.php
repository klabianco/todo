<?php

use GeminiAPI\Client;
use GeminiAPI\Resources\Parts\TextPart;
use OpenAI;

class AI
{
    private string $input;
    private string $prompt;
    private string $taskString;
    private string $imageData = '';
    private array $uimIds;
    private string $user;
    private $jsonResponse = false;
    private $systemMessage;
    private $imageSize;

    public function setPrompt(string $prompt): void
    {
        $this->prompt = $prompt;
    }

    public function setUser(string $user): void
    {
        $this->user = $user;
    }

    public function getUser(): string
    {
        return $this->user;
    }

    public function setUIMIds(array $ids): void
    {
        $this->uimIds = $ids;
    }

    public function getUIMIds(): array
    {
        return $this->uimIds;
    }

    public function setTaskString(string $string): void
    {
        $this->taskString = $string;
    }

    public function getTaskString(): string
    {
        return $this->taskString;
    }

    public function getPrompt(): string
    {
        return $this->prompt;
    }

    public function hasPrompt(): bool
    {
        return !empty($this->getPrompt());
    }

    public function getInput(): string
    {
        return $this->input;
    }

    public function setInput(string $input): void
    {
        $this->input = $input;
    }

    public function setJsonResponse(bool $jsonResponse): void
    {
        $this->jsonResponse = $jsonResponse;
    }

    public function getJsonResponse(): bool
    {
        return $this->jsonResponse;
    }

    public function setSystemMessage($message)
    {
        $this->systemMessage = $message;
    }

    public function getSystemMessage()
    {
        $msg = $this->systemMessage;

        if ($msg == null) {
            return '';
        }

        return $msg;
    }

    public function setImageSize($size)
    {
        $this->imageSize = $size;
    }

    public function getImageSize()
    {
        return $this->imageSize;
    }

    public function hasImageSize()
    {
        if ($this->getImageSize() != null) {
            return true;
        } else {
            return false;
        }
    }

    public function getOpenAIImageGenFile()
    {
        $apiKey = $_SERVER['OPENAI_API_KEY'];
        $client = OpenAI::client($apiKey);
        
        // Use the set image size if available, otherwise default to portrait mode
        $imageSize = $this->hasImageSize() ? $this->getImageSize() : '1024x1536';
        
        $response = $client->images()->create([
            'model' => 'gpt-image-1',
            'prompt' => $this->getPrompt(),
            'size' => $imageSize
        ]);

        return $response->data[0]->b64_json;
    }

    public function getResponseFromOpenAi($systemRole = "You are a helpful teacher", $temperature = 1.0, $frequencyPenalty = 0, $model = "gpt-4.1-mini", $maxTokens = 2000, $jsonResponse = false): mixed
    {
        if (!$this->hasPrompt()) {
            return false;
        }

        if ($this->getSystemMessage() != '') {
            $systemRole = $this->getSystemMessage();
        }

        $yourApiKey = $_SERVER['OPENAI_API_KEY'];
        $client = OpenAI::client($yourApiKey);

        $responseFormat = 'text';
        $developerName = "system";
        $systemRole = htmlspecialchars($systemRole);

        if ($model == "o3-mini" || $model == "o1") {
            $developerName = "developer";
            // sanitize special characters in the systemRole
        }

        if ($this->getJsonResponse()) $responseFormat = 'json_object';

        $params = [
            'model' => $model,
            'messages' => [
                [
                    "role" => $developerName,
                    "content" => $systemRole
                ],
                [
                    "role" => "user",
                    "content" => $this->getPrompt()
                ]
            ],
            'temperature' => $temperature,
            'frequency_penalty' => $frequencyPenalty,
            'presence_penalty' => 0,
            'response_format' => ['type' => $responseFormat]
        ];

        if ($model !== "o3-mini" && $model != "o1") {
            $params['max_completion_tokens'] = $maxTokens;
        }

        try {
            $response = $client->chat()->create($params);
        } catch (Exception $e) {
            $message = $e->getMessage();
            echo "error: " . $message . $model;
        }

        $content = $response->choices[0]->message->content;

        if ($model == "o3-mini") {
            /*
            echo "here!";
            var_dump($params);
            var_dump($response); 
            die;
            */
        }

        return $content;
    }

    public function getResponseFromXAI($systemRole = "You are a helpful teacher", $temperature = 1.0, $model = "grok-2-latest", $maxTokens = 8096, $json = true)
    {
        if (!$this->hasPrompt()) {
            return false;
        }

        // Use any system message if set
        if ($this->getSystemMessage() != '') {
            $systemRole = $this->getSystemMessage();
        }

        // Get the API key (ensure this is set in your environment as GROQ_API_KEY)
        $key = $_SERVER['XAI_API_KEY'];

        // Build the payload according to your new spec
        $data = [
            "messages" => [
                [
                    "role"    => "system",
                    "content" => $systemRole
                ],
                [
                    "role"    => "user",
                    "content" => $this->getPrompt()
                ]
            ],
            "model"                 => $model,
            "temperature"           => $temperature,
            "stream"                => false,
        ];

        if ($json) {
            $data["response_format"] = [
                "type" => "json_object"
            ];
        }

        // Initialize a cURL session with the new Groq endpoint
        $ch = curl_init('https://api.x.ai/v1/chat/completions');

        // Set cURL options
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer {$key}",
            "Content-Type: application/json"
        ]);

        // Execute the request and capture the response
        $response = curl_exec($ch);

        // Check for cURL errors
        if (curl_errno($ch)) {
            $error_msg = curl_error($ch);
            curl_close($ch);
            return "error: " . $error_msg;
        }

        curl_close($ch);

        $response = json_decode($response, true);
        $content = $response['choices'][0]['message']['content'];

        return $content;
    }

    public function setImage($base64Data)
    {
        $this->imageData = $base64Data;
    }

    public function hasImage()
    {
        return !empty($this->imageData);
    }

    public function getResponseFromGemini2()
    {
        // Set a higher execution time limit (120 seconds)
        $originalTimeLimit = ini_get('max_execution_time');
        set_time_limit(120);
        
        if (!$this->hasPrompt()) {
            // Restore original time limit before returning
            set_time_limit($originalTimeLimit);
            return false;
        }

        try {
            $apiKey = $_SERVER['GEMINI_API_KEY'];
            $client = new Client($apiKey);

            $response = $client->withV1BetaVersion()
                ->generativeModel("gemini-2.5-pro-preview-06-05")
                ->withSystemInstruction($this->getSystemMessage())
                ->generateContent(
                    new TextPart($this->getPrompt())
                );

            $text = $response->text();
            
            // Restore original time limit
            set_time_limit($originalTimeLimit);
            return $text;
        } catch (\Exception $e) {
            // Restore original time limit even if an error occurs
            set_time_limit($originalTimeLimit);
            return "Error: " . $e->getMessage();
        }
    }

    public function getResponseFromOpenAIVision()
    {
        if (!$this->hasPrompt()) {
            return false;
        }

        try {
            $apiKey = $_SERVER['OPENAI_API_KEY'];
            
            $messages = [];
            
            // Add system message if present
            if ($this->getSystemMessage()) {
                $messages[] = [
                    'role' => 'system',
                    'content' => $this->getSystemMessage()
                ];
            }
            
            // Build user message with image and text
            $userContent = [];
            
            if ($this->hasImage()) {
                $userContent[] = [
                    'type' => 'image_url',
                    'image_url' => [
                        'url' => 'data:image/jpeg;base64,' . $this->imageData
                    ]
                ];
            }
            
            $userContent[] = [
                'type' => 'text',
                'text' => $this->getPrompt()
            ];
            
            $messages[] = [
                'role' => 'user',
                'content' => $userContent
            ];
            
            $data = [
                'model' => 'gpt-4o',
                'messages' => $messages,
                'max_tokens' => 4096
            ];
            
            if ($this->jsonResponse) {
                $data['response_format'] = ['type' => 'json_object'];
            }
            
            $ch = curl_init('https://api.openai.com/v1/chat/completions');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Authorization: Bearer ' . $apiKey,
                'Content-Type: application/json'
            ]);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
            curl_setopt($ch, CURLOPT_TIMEOUT, 120);
            
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            
            if ($httpCode !== 200) {
                return "Error: OpenAI API returned status code " . $httpCode;
            }
            
            $result = json_decode($response, true);
            
            if (isset($result['choices'][0]['message']['content'])) {
                return $result['choices'][0]['message']['content'];
            }
            
            return "Error: No response from OpenAI";
            
        } catch (\Exception $e) {
            return "Error: " . $e->getMessage();
        }
    }

    public function getResponseFromGroq($systemRole = "You are a helpful teacher", $temperature = 1.0, $model = "deepseek-r1-distill-llama-70b", $maxTokens = 8096, $json = true)
    {
        if (!$this->hasPrompt()) {
            return false;
        }

        // Use any system message if set
        if ($this->getSystemMessage() != '') {
            $systemRole = $this->getSystemMessage();
        }

        // Get the API key (ensure this is set in your environment as GROQ_API_KEY)
        $key = $_SERVER['GROQ_API_KEY'];

        // Build the payload according to your new spec
        $data = [
            "messages" => [
                [
                    "role"    => "system",
                    "content" => $systemRole
                ],
                [
                    "role"    => "user",
                    "content" => $this->getPrompt()
                ]
            ],
            "model"                 => $model,
            "temperature"           => $temperature,
            "max_completion_tokens" => $maxTokens,
            "top_p"                 => 1,
            "stream"                => false,
            "stop"                  => null
        ];

        if ($json) {
            $data["response_format"] = [
                "type" => "json_object"
            ];
        }

        // Initialize a cURL session with the new Groq endpoint
        $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');

        // Set cURL options
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Authorization: Bearer {$key}",
            "Content-Type: application/json"
        ]);

        // Execute the request and capture the response
        $response = curl_exec($ch);

        // Check for cURL errors
        if (curl_errno($ch)) {
            $error_msg = curl_error($ch);
            curl_close($ch);
            return "error: " . $error_msg;
        }

        curl_close($ch);

        $response = json_decode($response, true);
        $content = $response['choices'][0]['message']['content'];

        return $content;
    }

    public function getResponseFromOpenAISupplyMessages($messages, $temperature, $frequencyPenalty, $model, $maxTokens)
    {
        $apiKey = $_SERVER['OPENAI_API_KEY'];
        $client = OpenAI::client($apiKey);

        $responseFormat = 'text';

        if ($this->getJsonResponse()) $responseFormat = 'json_object';

        try {
            $response = $client->chat()->create([
                'model' => $model,
                'messages' => $messages,
                'temperature' => $temperature,
                'max_tokens' => $maxTokens,
                'frequency_penalty' => $frequencyPenalty,
                'presence_penalty' => 0,
                'response_format' => ['type' => $responseFormat]
            ]);
        } catch (Exception $e) {
            $message = $e->getMessage();
            return "error: " . $message .  $model;
        }

        $content = $response->choices[0]->message->content;

        return $content;
    }

    public function streamTest()
    {

        $openAIKey = $_SERVER['OPENAI_API_KEY'];

        $openAi = new OpenAi($openAIKey);

        $opts = [
            'prompt' => "Hello",
            'temperature' => 0.9,
            "max_tokens" => 3000,
            "frequency_penalty" => 0,
            "presence_penalty" => 0.6,
            "stream" => true,
        ];

        header('Content-type: text/event-stream');
        header('Cache-Control: no-cache');

        $openAi->completion($opts, function ($curl_info, $data) {
            echo $data . "<br><br>";
            echo PHP_EOL;
            ob_flush();
            flush();
            return strlen($data);
        });
    }

    public function getDalle3ImageFromPrompt()
    {
        if ($this->hasPrompt() && $this->hasImageSize()) {
            $key = $_SERVER['OPENAI_API_KEY'];
            $client = OpenAI::client($key);

            try {
                $response = $client->images()->create([
                    'model' => 'dall-e-3',
                    'prompt' => $this->getPrompt(),
                    'n' => 1,
                    'size' => $this->getImageSize(),
                    'response_format' => 'url',
                ]);

                $response->created; // 1589478378

                foreach ($response->data as $data) {
                    $data->url; // 'https://oaidalleapiprodscus.blob.core.windows.net/private/...'
                    $data->b64_json; // null
                }

                $data = $response->toArray();

                return $data;
            } catch (Exception $e) {
                $message = $e->getMessage();
                return "error: " . $message .  $model;
            }
        } else {
            return false;
        }
    }

    public function stableDiffusionImage()
    {
        $key = $_SERVER['REPLICATE_API_KEY'];

        $data = [
            "version" => "ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4",
            "input" => [
                "prompt" => $this->getPrompt() . ". line art outline, minimalistic,  simple, few details, thin lines",
                "negative_prompt" => "color, ugly, low-res, deformed, blurry, mutation, blurry, malformed, disgusting, mutilated, mangled, old, color, dark, black",
                "scheduler" => "DDIM",
                "width" => 832,
                "height" => 1024
            ]
        ];

        // Initialize a cURL session
        $ch = curl_init('https://api.replicate.com/v1/predictions');

        // Set cURL options
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); // Return the response as a string
        curl_setopt($ch, CURLOPT_POST, true); // Set the request method to POST
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data)); // Attach the encoded JSON data
        curl_setopt($ch, CURLOPT_HTTPHEADER, [ // Set the required HTTP headers
            "Authorization: Token {$key}",
            "Content-Type: application/json"
        ]);

        // Execute the cURL request
        $response = curl_exec($ch);

        // Check for errors
        if (curl_errno($ch)) {
            echo 'Error:' . curl_error($ch);
        } else {
            // Process the response
            $data = json_decode($response, true);
            $id = $data['id'];

            print_r($data);

            $this->getStableDiffusionImageFromId($id);
        }

        // Close the cURL session
        curl_close($ch);
    }

    public function getStableDiffusionImageFromId($id)
    {
        $key = $_SERVER['REPLICATE_API_KEY'];

        // Initialize a cURL session
        $ch = curl_init('https://api.replicate.com/v1/predictions/' . $id);

        // Set cURL options
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); // Return the response as a string
        curl_setopt($ch, CURLOPT_HTTPHEADER, [ // Set the required HTTP headers
            "Authorization: Token {$key}",
        ]);

        // Execute the cURL request
        $response = curl_exec($ch);

        // Check for errors
        if (curl_errno($ch)) {
            echo 'Error:' . curl_error($ch);
        } else {
            // Process the response
            echo $response;

            print "here";
            print_r($response);
        }

        // Close the cURL session
        curl_close($ch);
    }
}